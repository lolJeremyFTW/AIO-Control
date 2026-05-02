// Cross-table search endpoint. Single round trip — we fan out to four
// queries in parallel and merge by score. RLS keeps results scoped to
// the current workspace automatically.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type Hit = {
  kind: "business" | "agent" | "queue" | "node" | "marketplace";
  id: string;
  title: string;
  sub?: string;
  href: string;
};

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ hits: [] });

  // Pick the first workspace the user belongs to. The header search is
  // workspace-scoped — derive the slug from the URL referrer if present.
  // For now keep it simple: pull all workspaces the user can see and
  // search across them, but restrict the href to the user's first slug
  // for the default workspace.
  const { data: ws } = await supabase
    .from("workspace_members")
    .select("workspaces:workspace_id(slug, id)")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const slug =
    (ws as unknown as { workspaces?: { slug: string; id: string } } | null)
      ?.workspaces?.slug ?? "";

  // ilike with %q% scans all text columns. Postgres' trigram + GIN
  // indexes would make this faster at scale; for now we cap at LIMIT 6
  // per source so the response stays snappy.
  const like = `%${q}%`;
  const [biz, agents, queue, marketplace] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, sub")
      .ilike("name", like)
      .limit(6)
      .then((r) => (r.data ?? []) as { id: string; name: string; sub: string | null }[]),
    supabase
      .from("agents")
      .select("id, name, business_id, provider")
      .or(`name.ilike.${like},provider.ilike.${like}`)
      .is("archived_at", null)
      .limit(6)
      .then((r) => (r.data ?? []) as { id: string; name: string; business_id: string | null; provider: string }[]),
    supabase
      .from("queue_items")
      .select("id, title, business_id, state")
      .ilike("title", like)
      .is("resolved_at", null)
      .limit(6)
      .then((r) => (r.data ?? []) as { id: string; title: string; business_id: string; state: string }[]),
    supabase
      .from("marketplace_agents")
      .select("id, slug, name, tagline, marketplace_kind")
      .or(`name.ilike.${like},tagline.ilike.${like}`)
      .limit(4)
      .then((r) => (r.data ?? []) as { id: string; slug: string; name: string; tagline: string; marketplace_kind: string }[]),
  ]);

  const hits: Hit[] = [
    ...biz.map((b) => ({
      kind: "business" as const,
      id: b.id,
      title: b.name,
      sub: b.sub ?? undefined,
      href: `/${slug}/business/${b.id}`,
    })),
    ...agents.map((a) => ({
      kind: "agent" as const,
      id: a.id,
      title: a.name,
      sub: a.provider,
      href: a.business_id
        ? `/${slug}/business/${a.business_id}/agents`
        : `/${slug}/dashboard`,
    })),
    ...queue.map((qi) => ({
      kind: "queue" as const,
      id: qi.id,
      title: qi.title,
      sub: qi.state,
      href: `/${slug}/business/${qi.business_id}`,
    })),
    ...marketplace.map((m) => ({
      kind: "marketplace" as const,
      id: m.id,
      title: m.name,
      sub: `${m.marketplace_kind} · ${m.tagline}`,
      href: `/${slug}/marketplace`,
    })),
  ];

  return NextResponse.json({ hits });
}
