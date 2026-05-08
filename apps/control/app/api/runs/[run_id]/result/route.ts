// Callback receiver for Claude Routines. Authenticate using a shared secret
// the routine echoes back in the payload — only routines we created (and
// whose secret we baked into the prompt) know the value.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { dispatchRunEvent } from "../../../../../lib/notify/dispatch";
import { recordScheduleRunMemory } from "../../../../../lib/runs/schedule-memory";
import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

type CallbackBody = {
  shared_secret?: string;
  output?: unknown;
  status?: "done" | "failed" | "review";
  cost_cents?: number;
  duration_ms?: number;
  error_text?: string;
};

type ScheduleJoin = {
  id: string;
  title: string | null;
  kind: string | null;
  cron_expr: string | null;
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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ run_id: string }> },
) {
  const { run_id } = await ctx.params;
  const expected = process.env.ROUTINE_CALLBACK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "ROUTINE_CALLBACK_SECRET is not configured." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as CallbackBody | null;
  if (!body || !body.shared_secret) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!safeEquals(body.shared_secret, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleSupabase();
  const { error } = await supabase
    .from("runs")
    .update({
      status: body.status ?? "done",
      ended_at: new Date().toISOString(),
      duration_ms: body.duration_ms,
      cost_cents: body.cost_cents ?? 0,
      output: body.output ?? null,
      error_text: body.error_text ?? null,
    })
    .eq("id", run_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Re-fetch the now-updated run row so the dispatcher has full
  // context (workspace_id, agent_id, schedule_id) to decide which
  // Telegram + custom integration to fire.
  const { data: run } = await supabase
    .from("runs")
    .select(
      "id, workspace_id, business_id, agent_id, schedule_id, status, cost_cents, duration_ms, output, error_text, schedules:schedule_id(id, title, kind, cron_expr)",
    )
    .eq("id", run_id)
    .maybeSingle();
  if (run) {
    void dispatchRunEvent(
      run as Parameters<typeof dispatchRunEvent>[0],
      run.status === "failed" ? "failed" : "done",
    );
    const joinedSchedule = run.schedules as unknown;
    const schedule = (
      Array.isArray(joinedSchedule) ? joinedSchedule[0] : joinedSchedule
    ) as ScheduleJoin | null;
    if (schedule?.id) {
      void recordScheduleRunMemory({
        schedule,
        runId: run.id as string,
        status: (run.status as string | null) ?? "done",
        endedAt: new Date().toISOString(),
        durationMs: (run.duration_ms as number | null) ?? null,
        costCents: (run.cost_cents as number | null) ?? null,
        outputText: outputToText(body.output),
        errorText: body.error_text ?? null,
      }).catch((err) =>
        console.warn("[schedule-memory] routine write failed", err),
      );
    }
  }

  return NextResponse.json({ ok: true });
}
