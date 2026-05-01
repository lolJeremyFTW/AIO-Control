// Server-side reads for the schedules + runs tables. We hit the
// schedules_safe view (defined in 004_scheduling.sql) so the bearer-token
// + secret-hash columns never come anywhere near the client. RLS still
// enforces workspace membership.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type ScheduleRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  business_id: string | null;
  kind: "cron" | "webhook" | "manual";
  cron_expr: string | null;
  provider_routine_id: string | null;
  enabled: boolean;
  last_fired_at: string | null;
  created_at: string;
};

export async function listSchedulesForBusiness(
  businessId: string,
): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedules_safe")
    .select(
      "id, workspace_id, agent_id, business_id, kind, cron_expr, provider_routine_id, enabled, last_fired_at, created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listSchedulesForBusiness failed", error);
    return [];
  }
  return (data ?? []) as ScheduleRow[];
}

export type RunRow = {
  id: string;
  agent_id: string;
  business_id: string | null;
  schedule_id: string | null;
  triggered_by: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  cost_cents: number;
  output: unknown;
  error_text: string | null;
  created_at: string;
};

export async function listRecentRunsForBusiness(
  businessId: string,
  limit = 10,
): Promise<RunRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("runs")
    .select(
      "id, agent_id, business_id, schedule_id, triggered_by, status, started_at, ended_at, duration_ms, cost_cents, output, error_text, created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listRecentRunsForBusiness failed", error);
    return [];
  }
  return (data ?? []) as RunRow[];
}
