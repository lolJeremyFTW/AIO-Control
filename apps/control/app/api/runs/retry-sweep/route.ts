// Cron-friendly endpoint that retries any failed runs whose
// next_retry_at is past. The retry creates a NEW run row (so we
// preserve the original failure for the audit trail) with
// attempt = previous + 1. Same agent + same input.
//
// Authenticate with x-api-key matching RETRY_SWEEP_SECRET — the cron
// daemon (e.g. systemd timer or Hetzner cloud cron) calls this every
// minute.

import { NextResponse } from "next/server";

import { dispatchRun } from "../../../../lib/dispatch/runs";
import { getServiceRoleSupabase } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.RETRY_SWEEP_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "RETRY_SWEEP_SECRET not configured" },
      { status: 503 },
    );
  }
  const got = req.headers.get("x-api-key") ?? "";
  if (got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleSupabase();
  const { data: due } = await supabase
    .from("runs_due_for_retry")
    .select("id, workspace_id, agent_id, business_id, attempt, max_attempts")
    .limit(20);

  const requeued: string[] = [];
  for (const r of due ?? []) {
    // Pull the original input so the retry hits the provider with the
    // same payload.
    const { data: original } = await supabase
      .from("runs")
      .select("input")
      .eq("id", r.id)
      .maybeSingle();

    const { data: newRun } = await supabase
      .from("runs")
      .insert({
        workspace_id: r.workspace_id,
        agent_id: r.agent_id,
        business_id: r.business_id,
        triggered_by: "retry",
        status: "queued",
        input: original?.input ?? null,
        attempt: (r.attempt as number) + 1,
        max_attempts: r.max_attempts,
      })
      .select("id")
      .single();

    if (!newRun) continue;

    // Clear retry-at on the original so we don't re-queue forever.
    await supabase
      .from("runs")
      .update({ next_retry_at: null })
      .eq("id", r.id);

    requeued.push(newRun.id as string);
    void dispatchRun(newRun.id as string).catch(() => null);
  }

  return NextResponse.json({ requeued, count: requeued.length });
}
