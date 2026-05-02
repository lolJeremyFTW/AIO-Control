// Server-side data fetchers for businesses, queue items, and the KPI view.
// All reads go through Supabase's PostgREST so RLS is enforced automatically.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type BusinessRow = {
  id: string;
  workspace_id: string;
  name: string;
  sub: string | null;
  letter: string;
  variant: string;
  icon: string | null;
  color_hex: string | null;
  logo_url: string | null;
  status: "running" | "paused";
  primary_action: string | null;
  created_at: string;
  sort_order: number;
  daily_spend_limit_cents: number | null;
  monthly_spend_limit_cents: number | null;
};

export async function listBusinesses(
  workspaceId: string,
): Promise<BusinessRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, workspace_id, name, sub, letter, variant, icon, color_hex, logo_url, status, primary_action, created_at, sort_order, daily_spend_limit_cents, monthly_spend_limit_cents",
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listBusinesses failed", error);
    return [];
  }
  return (data ?? []) as BusinessRow[];
}

export type QueueRow = {
  id: string;
  business_id: string;
  state: "auto" | "review" | "fail";
  confidence: string; // numeric returned as string by PostgREST
  title: string;
  meta: string | null;
  created_at: string;
};

export async function listOpenQueueItems(
  workspaceId: string,
  businessId?: string,
  limit = 12,
): Promise<QueueRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("queue_items")
    .select("id, business_id, state, confidence, title, meta, created_at")
    .eq("workspace_id", workspaceId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (businessId) q = q.eq("business_id", businessId);
  const { data, error } = await q;
  if (error) {
    console.error("listOpenQueueItems failed", error);
    return [];
  }
  return (data ?? []) as QueueRow[];
}

export type KpiRow = {
  business_id: string;
  workspace_id: string;
  period: "24H" | "7D" | "30D";
  usage_eur: number;
  revenue_eur: number;
  runs_count: number;
};

export async function listKpisForWorkspace(
  workspaceId: string,
): Promise<KpiRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("business_kpis_view")
    .select("business_id, workspace_id, period, usage_eur, revenue_eur, runs_count")
    .eq("workspace_id", workspaceId);
  if (error) {
    console.error("listKpisForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as KpiRow[];
}

/**
 * Reduces the KPI rows into a single "30D revenue minus 30D usage" P&L per
 * business. Useful for the per-business overview cards on the workspace
 * dashboard. Returns 0 entries for businesses with no KPI rows yet so the
 * caller doesn't have to merge defaults.
 */
export function summarizeKpis(rows: KpiRow[], businessIds: string[]) {
  const map = new Map<
    string,
    {
      revenue_30d: number;
      usage_30d: number;
      revenue_7d: number;
      runs_24h: number;
    }
  >();
  for (const id of businessIds) {
    map.set(id, { revenue_30d: 0, usage_30d: 0, revenue_7d: 0, runs_24h: 0 });
  }
  for (const r of rows) {
    const bucket = map.get(r.business_id);
    if (!bucket) continue;
    if (r.period === "30D") {
      bucket.revenue_30d = r.revenue_eur;
      bucket.usage_30d = r.usage_eur;
    }
    if (r.period === "7D") bucket.revenue_7d = r.revenue_eur;
    if (r.period === "24H") bucket.runs_24h = r.runs_count;
  }
  return map;
}
