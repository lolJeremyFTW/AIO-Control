import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const businessIdParam = req.nextUrl.searchParams.get("business_id");
  if (!businessIdParam) return NextResponse.json({ tabs: [] });

  const supabase = await createSupabaseServerClient();

  // BusinessTabs passes businessId which is now a slug. Resolve it to
  // the actual UUID so the custom_tabs FK query works correctly.
  let businessId = businessIdParam;
  if (!UUID_RE.test(businessIdParam)) {
    const { data: bizRow } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", businessIdParam)
      .maybeSingle();
    if (!bizRow) return NextResponse.json({ tabs: [] });
    businessId = bizRow.id as string;
  }

  const { data, error } = await supabase
    .from("custom_tabs")
    .select("id, label, url, sort_order")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tabs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { business_id: businessIdParam, workspace_id, label, url } = body as {
    business_id: string;
    workspace_id: string;
    label: string;
    url: string;
  };

  if (!businessIdParam || !workspace_id || !label || !url) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Resolve slug → UUID if needed.
  let business_id = businessIdParam;
  if (!UUID_RE.test(businessIdParam)) {
    const { data: bizRow } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", businessIdParam)
      .maybeSingle();
    if (!bizRow)
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    business_id = bizRow.id as string;
  }

  const { data, error } = await supabase
    .from("custom_tabs")
    .insert({ business_id, workspace_id, label, url })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
