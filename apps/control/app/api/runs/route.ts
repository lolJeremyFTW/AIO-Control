// Filtered + paginated runs feed for the runs aggregate page. Filters
// by business + optional status + optional agent_id. RLS handles
// workspace isolation; we just compose the query.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business");
  const workspaceId = url.searchParams.get("workspace");
  const status = url.searchParams.get("status");
  const agent = url.searchParams.get("agent");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  if (!businessId && !workspaceId) {
    return NextResponse.json(
      { error: "business or workspace required" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let q = supabase
    .from("runs")
    .select(
      "id, agent_id, business_id, status, triggered_by, duration_ms, cost_cents, output, error_text, created_at",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (businessId) q = q.eq("business_id", businessId);
  else if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (status) q = q.eq("status", status);
  if (agent) q = q.eq("agent_id", agent);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  return NextResponse.json({ runs: rows, hasMore });
}
