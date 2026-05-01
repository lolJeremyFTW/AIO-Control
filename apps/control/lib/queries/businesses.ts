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
  status: "running" | "paused";
  primary_action: string | null;
  created_at: string;
};

export async function listBusinesses(
  workspaceId: string,
): Promise<BusinessRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, workspace_id, name, sub, letter, variant, status, primary_action, created_at",
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
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
  label: string;
  value: number;
  unit: string | null;
  delta_pct: number | null;
};

export async function listKpisForWorkspace(
  workspaceId: string,
): Promise<KpiRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("business_kpis_view")
    .select("business_id, label, value, unit, delta_pct")
    .eq("workspace_id", workspaceId);
  if (error) {
    console.error("listKpisForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as KpiRow[];
}
