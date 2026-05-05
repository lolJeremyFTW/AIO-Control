import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id");
  if (!businessId) return NextResponse.json({ tabs: [] });

  const supabase = await createSupabaseServerClient();
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
  const { business_id, workspace_id, label, url } = body as {
    business_id: string;
    workspace_id: string;
    label: string;
    url: string;
  };

  if (!business_id || !workspace_id || !label || !url) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_tabs")
    .insert({ business_id, workspace_id, label, url })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
