// Legacy direct agent-dashboard route, owner-gated for old links.
// Dashboards should normally render through business/topic tabs.

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  if (!slug || slug.length < 4 || !/^[A-Za-z0-9_-]+$/.test(slug)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agent_dashboards")
    .select("html_content")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(data.html_content, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "same-origin",
    },
  });
}
