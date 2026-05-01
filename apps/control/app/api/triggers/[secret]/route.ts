// Inbound webhook trigger. External systems POST here with the per-schedule
// secret in the URL — we sha256-compare it against schedules.webhook_secret_hash
// (constant-time comparison via Buffer.equals). On match we insert a queued
// run row. The actual agent execution runs inside the chat-route flow when
// phase 4.5 wires a worker dispatcher; phase 4 just demonstrates the auth
// path + run row creation end-to-end.

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { dispatchRun } from "../../../../lib/dispatch/runs";
import { getServiceRoleSupabase } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ secret: string }> },
) {
  const { secret } = await ctx.params;
  if (!secret) return NextResponse.json({ error: "missing secret" }, { status: 400 });

  const supabase = getServiceRoleSupabase();
  const hash = sha256(secret);

  const { data: schedules, error } = await supabase
    .from("schedules")
    .select("id, workspace_id, agent_id, business_id, enabled, webhook_secret_hash, kind")
    .eq("kind", "webhook")
    .eq("webhook_secret_hash", hash)
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const schedule = schedules?.[0];
  if (!schedule) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Cheap defence-in-depth — even though we already match by hash, still
  // do a constant-time verify to keep the path uniform.
  if (!safeEquals(schedule.webhook_secret_hash!, hash)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!schedule.enabled) {
    return NextResponse.json({ error: "schedule disabled" }, { status: 423 });
  }

  const payload = await req.json().catch(() => ({}));

  const { data: run, error: runErr } = await supabase
    .from("runs")
    .insert({
      workspace_id: schedule.workspace_id,
      agent_id: schedule.agent_id,
      business_id: schedule.business_id,
      schedule_id: schedule.id,
      triggered_by: "webhook",
      status: "queued",
      input: payload,
    })
    .select("id")
    .single();
  if (runErr || !run) {
    return NextResponse.json(
      { error: runErr?.message ?? "run insert failed" },
      { status: 500 },
    );
  }

  await supabase
    .from("schedules")
    .update({ last_fired_at: new Date().toISOString() })
    .eq("id", schedule.id);

  // Fire-and-forget: kick off the worker dispatcher. We don't await so the
  // webhook responds immediately; the run row tracks status. Errors land
  // in run.error_text.
  void dispatchRun(run.id).catch((err: unknown) => {
    console.error("dispatchRun failed", err);
  });

  return NextResponse.json({ ok: true, run_id: run.id });
}
