// Payload-based callback receiver for Claude Routines.
//
// Why this exists alongside `/api/runs/[run_id]/result`:
// the Routines API has no URL-templating feature, so we cannot put a
// real run_id in the callback URL at routine-creation time. Instead we
// register THIS endpoint as the callback and the routine echoes back
// its own `routine_id` in the body. We look up the matching schedule,
// insert a fresh `runs` row, and dispatch.
//
// Auth: every routine echoes `shared_secret` in the body — only
// routines we created (and whose secret we baked into the prompt) know
// the value. timingSafeEqual to avoid leaking length info.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { dispatchRunEvent } from "../../../../lib/notify/dispatch";
import { recordScheduleRunMemory } from "../../../../lib/runs/schedule-memory";
import { mergeScheduleSnapshotIntoInput } from "../../../../lib/runs/schedule-label";
import { getServiceRoleSupabase } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

type CallbackBody = {
  shared_secret?: string;
  routine_id?: string;
  output?: unknown;
  status?: "done" | "failed" | "review";
  cost_cents?: number;
  duration_ms?: number;
  error_text?: string;
};

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function outputToText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "summary", "output"]) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function POST(req: Request) {
  const expected = process.env.ROUTINE_CALLBACK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "ROUTINE_CALLBACK_SECRET is not configured." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as CallbackBody | null;
  if (!body?.shared_secret || !body.routine_id) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!safeEquals(body.shared_secret, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleSupabase();

  // Find the schedule this routine belongs to.
  const { data: sched } = await supabase
    .from("schedules")
    .select("id, workspace_id, agent_id, business_id, title, kind, cron_expr")
    .eq("provider_routine_id", body.routine_id)
    .maybeSingle();
  if (!sched) {
    return NextResponse.json(
      { error: "routine_id does not match any schedule" },
      { status: 404 },
    );
  }

  // Insert a fresh runs row carrying the result. Dispatcher / notify
  // pipeline picks it up like any other run.
  const finalStatus = body.status ?? (body.error_text ? "failed" : "done");
  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: sched.workspace_id,
      agent_id: sched.agent_id,
      business_id: sched.business_id,
      schedule_id: sched.id,
      triggered_by: "cron",
      status: finalStatus,
      input: mergeScheduleSnapshotIntoInput(null, {
        id: sched.id,
        title: sched.title,
        kind: sched.kind,
        cron_expr: sched.cron_expr,
      }),
      ended_at: new Date().toISOString(),
      duration_ms: body.duration_ms,
      cost_cents: body.cost_cents ?? 0,
      output: body.output ?? null,
      error_text: body.error_text ?? null,
    })
    .select(
      "id, workspace_id, business_id, agent_id, schedule_id, status, cost_cents, duration_ms, output, error_text",
    )
    .single();
  if (error || !run) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  // Refresh the schedule's watermark so the cron-scheduler doesn't
  // also fire it locally next minute.
  await supabase
    .from("schedules")
    .update({ last_fired_at: new Date().toISOString() })
    .eq("id", sched.id);

  void dispatchRunEvent(
    run as Parameters<typeof dispatchRunEvent>[0],
    finalStatus === "failed" ? "failed" : "done",
  );
  void recordScheduleRunMemory({
    schedule: {
      id: sched.id as string,
      title: (sched.title as string | null) ?? null,
      kind: (sched.kind as string | null) ?? null,
      cron_expr: (sched.cron_expr as string | null) ?? null,
    },
    runId: run.id as string,
    status: finalStatus,
    endedAt: new Date().toISOString(),
    durationMs: (run.duration_ms as number | null) ?? null,
    costCents: (run.cost_cents as number | null) ?? null,
    outputText: outputToText(body.output),
    errorText: body.error_text ?? null,
  }).catch((err) =>
    console.warn("[schedule-memory] routine write failed", err),
  );

  return NextResponse.json({ ok: true });
}
