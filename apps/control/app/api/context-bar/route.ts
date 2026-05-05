// GET /api/context-bar?bizId=xxx[&nodeId=yyy]
//
// Returns lightweight KPI summary for the sticky header context bar.
// • Without nodeId → business-level: revenue/usage/runs from
//   business_kpis_view + queue counts from queue_items.
// • With nodeId → topic/module-level: cost + runs from runs table
//   scoped to the node + all descendants via descendant_nav_node_ids RPC.

import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { listDescendantNavNodeIds } from "../../../lib/queries/nav-nodes";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bizId = searchParams.get("bizId");
  const nodeId = searchParams.get("nodeId");

  if (!bizId) {
    return Response.json({ error: "bizId required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  if (!nodeId) {
    // ── Business-level ───────────────────────────────────────────
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [kpisRes, autoRes, reviewRes, runsOkRes, runsFailRes, agentsRes] =
      await Promise.all([
        supabase
          .from("business_kpis_view")
          .select("period, usage_eur, revenue_eur, runs_count")
          .eq("business_id", bizId),
        supabase
          .from("queue_items")
          .select("id", { count: "exact", head: true })
          .eq("business_id", bizId)
          .is("resolved_at", null)
          .eq("state", "auto"),
        supabase
          .from("queue_items")
          .select("id", { count: "exact", head: true })
          .eq("business_id", bizId)
          .is("resolved_at", null)
          .eq("state", "review"),
        supabase
          .from("runs")
          .select("id", { count: "exact", head: true })
          .eq("business_id", bizId)
          .eq("status", "done")
          .gte("created_at", since24h),
        supabase
          .from("runs")
          .select("id", { count: "exact", head: true })
          .eq("business_id", bizId)
          .eq("status", "failed")
          .gte("created_at", since24h),
        supabase
          .from("agents")
          .select("id", { count: "exact", head: true })
          .eq("business_id", bizId)
          .is("archived_at", null),
      ]);

    type KpiRow = {
      period: string;
      usage_eur: number;
      revenue_eur: number;
      runs_count: number;
    };
    const kpis = (kpisRes.data ?? []) as KpiRow[];
    const k30 = kpis.find((k) => k.period === "30D");
    const k24 = kpis.find((k) => k.period === "24H");

    return Response.json({
      type: "business",
      revenue_30d_eur: k30?.revenue_eur ?? 0,
      usage_30d_eur: k30?.usage_eur ?? 0,
      runs_24h: k24?.runs_count ?? 0,
      runs_ok_24h: runsOkRes.count ?? 0,
      runs_fail_24h: runsFailRes.count ?? 0,
      agents_count: agentsRes.count ?? 0,
      queue_auto: autoRes.count ?? 0,
      queue_review: reviewRes.count ?? 0,
    });
  }

  // ── Topic/module-level ─────────────────────────────────────────
  const scopeIds = await listDescendantNavNodeIds(nodeId);
  const since30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [runs30dRes, runs24hRes, reviewRes, autoRes] = await Promise.all([
    supabase
      .from("runs")
      .select("cost_cents")
      .in("nav_node_id", scopeIds)
      .gte("created_at", since30d),
    supabase
      .from("runs")
      .select("id", { count: "exact", head: true })
      .in("nav_node_id", scopeIds)
      .gte("created_at", since24h),
    supabase
      .from("queue_items")
      .select("id", { count: "exact", head: true })
      .in("nav_node_id", scopeIds)
      .is("resolved_at", null)
      .eq("state", "review"),
    supabase
      .from("queue_items")
      .select("id", { count: "exact", head: true })
      .in("nav_node_id", scopeIds)
      .is("resolved_at", null)
      .eq("state", "auto"),
  ]);

  type RunCost = { cost_cents: number | null };
  const runs30d = (runs30dRes.data ?? []) as RunCost[];
  const cost30dCents = runs30d.reduce(
    (acc, r) => acc + (r.cost_cents ?? 0),
    0,
  );

  return Response.json({
    type: "topic",
    cost_30d_eur: cost30dCents / 100,
    runs_24h: runs24hRes.count ?? 0,
    queue_review: reviewRes.count ?? 0,
    queue_auto: autoRes.count ?? 0,
  });
}
