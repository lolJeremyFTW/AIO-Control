// Returns recent runs for a specific agent. RLS scopes everything to
// the user's workspaces so we don't need extra auth here beyond the
// session cookie.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ agent_id: string }> },
) {
  const { agent_id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id, status, triggered_by, started_at, ended_at, duration_ms, cost_cents, output, error_text, created_at",
    )
    .eq("agent_id", agent_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ runs: data ?? [] });
}
