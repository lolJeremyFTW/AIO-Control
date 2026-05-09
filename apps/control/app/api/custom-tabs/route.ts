import { NextRequest, NextResponse } from "next/server";
import {
  dashboardOrigin,
  normalizeDashboardUrl,
} from "../../../lib/dashboards/urls";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function slugPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "tab"
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function resolveBusinessId(
  supabase: Supabase,
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

async function resolveNavNode(
  supabase: Supabase,
  navNodeId: string,
): Promise<{ business_id: string; workspace_id: string } | null> {
  const { data } = await supabase
    .from("nav_nodes")
    .select("business_id, workspace_id")
    .eq("id", navNodeId)
    .maybeSingle();
  if (!data) return null;
  return {
    business_id: data.business_id as string,
    workspace_id: data.workspace_id as string,
  };
}

async function uniqueCustomTabSlug(
  supabase: Supabase,
  input: {
    workspaceId: string;
    businessId: string;
    navNodeId?: string | null;
    label: string;
  },
): Promise<string> {
  const base = slugPart(input.label);
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    let q = supabase
      .from("custom_tabs")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("slug", slug);
    q = input.navNodeId
      ? q.eq("nav_node_id", input.navNodeId)
      : q.eq("business_id", input.businessId).is("nav_node_id", null);

    const { data, error } = await q.maybeSingle();
    if (error) return `${base}-${randomSuffix()}`;
    if (!data) return slug;
  }
  return `${base}-${randomSuffix()}`;
}

async function nextSortOrder(
  supabase: Supabase,
  input: {
    workspaceId: string;
    businessId: string;
    navNodeId?: string | null;
  },
): Promise<number> {
  let q = supabase
    .from("custom_tabs")
    .select("sort_order")
    .eq("workspace_id", input.workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1);
  q = input.navNodeId
    ? q.eq("nav_node_id", input.navNodeId)
    : q.eq("business_id", input.businessId).is("nav_node_id", null);

  const { data } = await q;
  const last = Number(
    (data?.[0] as { sort_order?: number } | undefined)?.sort_order,
  );
  return Number.isFinite(last) ? last + 10 : 10;
}

export async function GET(req: NextRequest) {
  const businessIdParam = req.nextUrl.searchParams.get("business_id");
  const navNodeId = req.nextUrl.searchParams.get("nav_node_id");

  if (!businessIdParam && !navNodeId) return NextResponse.json({ tabs: [] });

  const supabase = await createSupabaseServerClient();
  const origin = dashboardOrigin(req.nextUrl.origin);
  let q = supabase
    .from("custom_tabs")
    .select("id, label, slug, url, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (navNodeId) {
    q = q.eq("nav_node_id", navNodeId);
  } else if (businessIdParam) {
    const businessId = await resolveBusinessId(supabase, businessIdParam);
    if (!businessId) return NextResponse.json({ tabs: [] });
    q = q.eq("business_id", businessId).is("nav_node_id", null);
  }

  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    tabs: (data ?? []).map((tab) => ({
      ...tab,
      url: normalizeDashboardUrl(tab.url as string, origin),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    business_id: businessIdParam,
    workspace_id,
    nav_node_id,
    label,
    url,
    sort_order,
  } = body as {
    business_id?: string;
    workspace_id: string;
    nav_node_id?: string;
    label: string;
    url: string;
    sort_order?: number;
  };

  if (!workspace_id || !label || !url || (!businessIdParam && !nav_node_id)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const origin = dashboardOrigin(req.nextUrl.origin);

  let business_id: string | null = null;
  if (businessIdParam) {
    business_id = await resolveBusinessId(supabase, businessIdParam);
    if (!business_id)
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 },
      );
  }
  if (nav_node_id) {
    const navNode = await resolveNavNode(supabase, nav_node_id);
    if (!navNode)
      return NextResponse.json(
        { error: "Nav node not found" },
        { status: 404 },
      );
    if (navNode.workspace_id !== workspace_id)
      return NextResponse.json(
        { error: "Nav node does not belong to workspace" },
        { status: 400 },
      );
    if (business_id && business_id !== navNode.business_id)
      return NextResponse.json(
        { error: "Nav node does not belong to business" },
        { status: 400 },
      );
    business_id = navNode.business_id;
  }
  if (!business_id)
    return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const slug = await uniqueCustomTabSlug(supabase, {
    workspaceId: workspace_id,
    businessId: business_id,
    navNodeId: nav_node_id ?? null,
    label,
  });
  const tabSortOrder =
    typeof sort_order === "number"
      ? sort_order
      : await nextSortOrder(supabase, {
          workspaceId: workspace_id,
          businessId: business_id,
          navNodeId: nav_node_id ?? null,
        });

  const { data, error } = await supabase
    .from("custom_tabs")
    .insert({
      business_id,
      workspace_id,
      nav_node_id: nav_node_id ?? null,
      label,
      slug,
      url: normalizeDashboardUrl(url, origin),
      sort_order: tabSortOrder,
    })
    .select("id, slug")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, slug: data.slug });
}
