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
import {
  mergeScheduleSnapshotIntoInput,
  readRunPrompt,
  type ScheduleLabelSource,
} from "../../../../lib/runs/schedule-label";
import { getServiceRoleSupabase } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

const RETRY_SAME_AGENT_DELAY_MS = Number(
  process.env.RETRY_SAME_AGENT_DELAY_MS ?? String(5 * 60_000),
);

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
      .select("input, schedule_id, nav_node_id")
      .eq("id", r.id)
      .maybeSingle();
    const schedule = await resolveRetryScheduleContext(supabase, {
      workspaceId: r.workspace_id as string,
      agentId: r.agent_id as string,
      businessId: (r.business_id as string | null) ?? null,
      scheduleId: (original?.schedule_id as string | null) ?? null,
      input: original?.input ?? null,
    });
    if (schedule?.enabled === false) {
      await supabase
        .from("runs")
        .update({ next_retry_at: null })
        .eq("id", r.id);
      continue;
    }
    if (
      await hasActiveAgentRun(
        supabase,
        r.workspace_id as string,
        r.agent_id as string,
      )
    ) {
      await supabase
        .from("runs")
        .update({
          next_retry_at: new Date(
            Date.now() + RETRY_SAME_AGENT_DELAY_MS,
          ).toISOString(),
        })
        .eq("id", r.id);
      continue;
    }
    const retryInput = mergeScheduleSnapshotIntoInput(
      original?.input ?? null,
      schedule,
    );

    const { data: newRun } = await supabase
      .from("runs")
      .insert({
        workspace_id: r.workspace_id,
        agent_id: r.agent_id,
        business_id: r.business_id,
        schedule_id:
          (original?.schedule_id as string | null) ?? schedule?.id ?? null,
        nav_node_id:
          (original?.nav_node_id as string | null) ??
          schedule?.nav_node_id ??
          null,
        triggered_by: "retry",
        status: "queued",
        input: retryInput,
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

async function resolveRetryScheduleContext(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  opts: {
    workspaceId: string;
    agentId: string;
    businessId: string | null;
    scheduleId: string | null;
    input: unknown;
  },
): Promise<(ScheduleLabelSource & { enabled?: boolean | null }) | null> {
  if (opts.scheduleId) {
    const { data } = await supabase
      .from("schedules")
      .select("id, title, kind, cron_expr, nav_node_id, enabled")
      .eq("id", opts.scheduleId)
      .maybeSingle();
    if (data) return data as ScheduleLabelSource & { enabled?: boolean | null };
  }

  const prompt = readRunPrompt(opts.input);
  if (!prompt) return null;

  let query = supabase
    .from("schedules")
    .select("id, title, kind, cron_expr, nav_node_id, enabled")
    .eq("workspace_id", opts.workspaceId)
    .eq("agent_id", opts.agentId)
    .eq("instructions", prompt)
    .limit(2);
  query = opts.businessId
    ? query.eq("business_id", opts.businessId)
    : query.is("business_id", null);

  const { data } = await query;
  return data && data.length === 1
    ? (data[0] as ScheduleLabelSource & { enabled?: boolean | null })
    : null;
}

async function hasActiveAgentRun(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  workspaceId: string,
  agentId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .eq("status", "running");
  if (error) return true;
  return Boolean(count && count > 0);
}
