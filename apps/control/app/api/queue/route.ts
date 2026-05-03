// Queue feed for the workspace-wide /queue page. Filters by state +
// business; "show=all" includes resolved items. RLS scopes everything
// to the user's workspaces.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace");
  const state = url.searchParams.get("state");
  const business = url.searchParams.get("business");
  const showAll = url.searchParams.get("show") === "all";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  if (!workspaceId) {
    return NextResponse.json({ error: "workspace required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let q = supabase
    .from("queue_items")
    .select(
      "id, business_id, state, confidence, title, meta, resolved_at, decision, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (!showAll) q = q.is("resolved_at", null);
  if (state) q = q.eq("state", state);
  if (business) q = q.eq("business_id", business);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  return NextResponse.json({ items: rows, hasMore });
}
