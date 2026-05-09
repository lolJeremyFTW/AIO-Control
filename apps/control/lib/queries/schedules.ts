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
  title: string | null;
  description: string | null;
  instructions: string | null;
  timezone: string | null;
  telegram_target_id: string | null;
  custom_integration_id: string | null;
  nav_node_id: string | null;
};

export type ScheduleReferenceRow = {
  id: string;
  workspace_id: string;
  schedule_id: string;
  path: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function listScheduleReferencesForSchedules(
  scheduleIds: string[],
): Promise<ScheduleReferenceRow[]> {
  if (scheduleIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedule_references")
    .select(
      "id, workspace_id, schedule_id, path, content, sort_order, created_at, updated_at",
    )
    .in("schedule_id", scheduleIds)
    .order("sort_order", { ascending: true })
    .order("path", { ascending: true });
  if (error) {
    console.error("listScheduleReferencesForSchedules failed", error);
    return [];
  }
  return (data ?? []) as ScheduleReferenceRow[];
}

export function groupScheduleReferences(
  rows: ScheduleReferenceRow[],
): Record<string, ScheduleReferenceRow[]> {
  return rows.reduce<Record<string, ScheduleReferenceRow[]>>((acc, row) => {
    const current = acc[row.schedule_id] ?? [];
    current.push(row);
    acc[row.schedule_id] = current;
    return acc;
  }, {});
}

export async function listSchedulesForBusiness(
  businessId: string,
): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedules_safe")
    .select(
      "id, workspace_id, agent_id, business_id, kind, cron_expr, provider_routine_id, enabled, last_fired_at, created_at, title, description, instructions, timezone, telegram_target_id, custom_integration_id, nav_node_id",
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
  nav_node_id: string | null;
  schedule_id: string | null;
  schedules: {
    title: string | null;
    kind: string | null;
    cron_expr: string | null;
  } | null;
  triggered_by: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  cost_cents: number;
  input: unknown;
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
      "id, agent_id, business_id, nav_node_id, schedule_id, schedules:schedule_id(title, kind, cron_expr), triggered_by, status, started_at, ended_at, duration_ms, cost_cents, input, output, error_text, created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listRecentRunsForBusiness failed", error);
    return [];
  }
  return (data ?? []) as unknown as RunRow[];
}

/**
 * Workspace-wide read used by the agents dashboard. Pulls every
 * schedule across every business so the calendar can show next
 * fire-times. RLS gates by membership.
 */
export async function listSchedulesForWorkspace(
  workspaceId: string,
): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedules_safe")
    .select(
      "id, workspace_id, agent_id, business_id, kind, cron_expr, provider_routine_id, enabled, last_fired_at, created_at, title, description, instructions, timezone, telegram_target_id, custom_integration_id, nav_node_id",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listSchedulesForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as ScheduleRow[];
}

export async function listRecentRunsForWorkspace(
  workspaceId: string,
  limit = 200,
): Promise<RunRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("runs")
    .select(
      "id, agent_id, business_id, nav_node_id, schedule_id, schedules:schedule_id(title, kind, cron_expr), triggered_by, status, started_at, ended_at, duration_ms, cost_cents, input, output, error_text, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listRecentRunsForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as unknown as RunRow[];
}
