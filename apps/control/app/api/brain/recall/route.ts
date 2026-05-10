import { NextResponse } from "next/server";

import { recallBrainNotes } from "../../../../lib/brain/semantic-search";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  workspace_id?: string;
  workspace_slug?: string;
  business_id?: string | null;
  nav_node_id?: string | null;
  query?: string;
  limit?: number;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const query = body?.query?.trim() ?? "";
  if (!body || !query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await resolveWorkspace(supabase, body);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await recallBrainNotes({
    workspaceId: workspace.id,
    query,
    businessId: body.business_id ?? null,
    navNodeId: body.nav_node_id ?? null,
    limit: body.limit,
  });

  return NextResponse.json({
    results,
    embedding_model: process.env.BRAIN_EMBEDDING_MODEL ?? "bge-m3",
    reranker_enabled: Boolean(process.env.BRAIN_RERANKER_URL),
  });
}

async function resolveWorkspace(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  body: Body,
): Promise<{ id: string; slug: string } | null> {
  if (body.workspace_id) {
    const { data } = await supabase
      .from("workspaces")
      .select("id, slug")
      .eq("id", body.workspace_id)
      .maybeSingle();
    return (data as { id: string; slug: string } | null) ?? null;
  }
  if (body.workspace_slug) {
    const { data } = await supabase
      .from("workspaces")
      .select("id, slug")
      .eq("slug", body.workspace_slug)
      .maybeSingle();
    return (data as { id: string; slug: string } | null) ?? null;
  }
  return null;
}
