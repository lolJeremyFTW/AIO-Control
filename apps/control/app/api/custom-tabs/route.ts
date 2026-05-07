import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveBusinessId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  param: string,
): Promise<string | null> {
  if (UUID_RE.test(param)) return param;
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("slug", param)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

export async function GET(req: NextRequest) {
  const businessIdParam = req.nextUrl.searchParams.get("business_id");
  const navNodeId = req.nextUrl.searchParams.get("nav_node_id");

  if (!businessIdParam && !navNodeId) return NextResponse.json({ tabs: [] });

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("custom_tabs")
    .select("id, label, url, sort_order")
    .order("sort_order", { ascending: true });

  if (navNodeId) {
    q = q.eq("nav_node_id", navNodeId);
  } else if (businessIdParam) {
    const businessId = await resolveBusinessId(supabase, businessIdParam);
    if (!businessId) return NextResponse.json({ tabs: [] });
    q = q.eq("business_id", businessId).is("nav_node_id", null);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tabs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    business_id: businessIdParam,
    workspace_id,
    nav_node_id,
    label,
    url,
  } = body as {
    business_id?: string;
    workspace_id: string;
    nav_node_id?: string;
    label: string;
    url: string;
  };

  if (!workspace_id || !label || !url) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  let business_id: string | null = null;
  if (businessIdParam) {
    business_id = await resolveBusinessId(supabase, businessIdParam);
    if (!business_id)
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("custom_tabs")
    .insert({
      business_id,
      workspace_id,
      nav_node_id: nav_node_id ?? null,
      label,
      url,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
