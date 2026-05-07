// Cross-table search endpoint. Single round trip — we fan out to four
// queries in parallel and merge by score. RLS keeps results scoped to
// the current workspace automatically.

import { NextResponse } from "next/server";

import {
  translateAgentRows,
  translateBusinessRows,
  translateContentBatch,
  translateQueueRows,
} from "../../../lib/i18n/content-translations";
import { LOCALES, translate, type Locale } from "../../../lib/i18n/dict";
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
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const locale = normalizeLocale(url.searchParams.get("locale"));
  const workspaceSlug = url.searchParams.get("workspace") || null;
  // Optional scope filters. The search modal passes these so the user
  // can narrow to a single business or workspace-global.
  //   business=<uuid>  → restrict businesses/agents/queue to that biz
  //   scope=global     → only workspace-global agents (business_id IS NULL)
  //                       + dashboard-level businesses
  //   topic=<navnode>  → restrict agents/queue tagged to that nav node
  //                       (when the row has a navnode_id column)
  const businessFilter = url.searchParams.get("business") || null;
  const scopeFilter = url.searchParams.get("scope") || null;
  const topicFilter = url.searchParams.get("topic") || null;
  if (q.length < 1) return NextResponse.json({ hits: [] });

  // Pick the first workspace the user belongs to. The header search is
  // workspace-scoped — derive the slug from the URL referrer if present.
  // For now keep it simple: pull all workspaces the user can see and
  // search across them, but restrict the href to the user's first slug
  // for the default workspace.
  let workspace: { id: string; slug: string } | null = null;
  if (workspaceSlug) {
    const { data: workspaceRow } = await supabase
      .from("workspaces")
      .select("id, slug")
      .eq("slug", workspaceSlug)
      .maybeSingle();
    workspace = (workspaceRow as { id: string; slug: string } | null) ?? null;
  }
  if (!workspace) {
    const { data: ws } = await supabase
      .from("workspace_members")
      .select("workspaces:workspace_id(slug, id)")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    workspace =
      (ws as unknown as { workspaces?: { slug: string; id: string } } | null)
        ?.workspaces ?? null;
  }
  const slug = workspace?.slug ?? "";
  const workspaceId = workspace?.id ?? null;
  const businessScopeId =
    businessFilter && workspaceId
      ? await resolveBusinessScopeId(supabase, workspaceId, businessFilter)
      : businessFilter;

  // ilike with %q% scans all text columns. Postgres' trigram + GIN
  // indexes would make this faster at scale; for now we cap at LIMIT 6
  // per source so the response stays snappy.
  const like = `%${q}%`;

  // Builders: scope filters apply early so we don't pull rows we'll
  // throw away.
  const bizQuery = supabase
    .from("businesses")
    .select("id, workspace_id, slug, name, sub")
    .ilike("name", like)
    .limit(6);
  if (workspaceId) bizQuery.eq("workspace_id", workspaceId);
  if (businessScopeId) bizQuery.eq("id", businessScopeId);

  const agentsQuery = supabase
    .from("agents")
    .select("id, workspace_id, name, business_id, provider")
    .or(`name.ilike.${like},provider.ilike.${like}`)
    .is("archived_at", null)
    .limit(6);
  if (workspaceId) agentsQuery.eq("workspace_id", workspaceId);
  if (businessScopeId) agentsQuery.eq("business_id", businessScopeId);
  if (scopeFilter === "global") agentsQuery.is("business_id", null);

  const queueQuery = supabase
    .from("queue_items")
    .select("id, workspace_id, title, business_id, state")
    .ilike("title", like)
    .is("resolved_at", null)
    .limit(6);
  if (workspaceId) queueQuery.eq("workspace_id", workspaceId);
  if (businessScopeId) queueQuery.eq("business_id", businessScopeId);

  const [biz, agents, queue, marketplace] = await Promise.all([
    bizQuery.then(
      (r) =>
        (r.data ?? []) as {
          id: string;
          workspace_id: string;
          slug: string;
          name: string;
          sub: string | null;
        }[],
    ),
    agentsQuery.then(
      (r) =>
        (r.data ?? []) as {
          id: string;
          workspace_id: string;
          name: string;
          business_id: string | null;
          provider: string;
        }[],
    ),
    queueQuery.then(
      (r) =>
        (r.data ?? []) as {
          id: string;
          workspace_id: string;
          title: string;
          business_id: string;
          state: string;
        }[],
    ),
    // Marketplace is workspace-wide, never narrowed by business/topic.
    supabase
      .from("marketplace_agents")
      .select("id, slug, name, tagline, marketplace_kind")
      .or(`name.ilike.${like},tagline.ilike.${like}`)
      .limit(4)
      .then(
        (r) =>
          (r.data ?? []) as {
            id: string;
            slug: string;
            name: string;
            tagline: string;
            marketplace_kind: string;
          }[],
      ),
  ]);
  // Topic filter is a soft narrow — most agent/queue rows don't carry
  // navnode_id yet, so we can only honour it when the column exists.
  // Reserved for the future; reference the var so linters don't whine.
  void topicFilter;

  const [bizRows, agentRows, queueRows, marketplaceRows] =
    locale && workspaceId
      ? await Promise.all([
          translateBusinessRows(workspaceId, locale, biz, {
            credentialOwnerUserId: user.id,
          }),
          translateAgentRows(workspaceId, locale, agents, {
            credentialOwnerUserId: user.id,
          }),
          translateQueueRows(workspaceId, locale, queue, {
            credentialOwnerUserId: user.id,
          }),
          translateMarketplaceRows(workspaceId, locale, marketplace, user.id),
        ])
      : [biz, agents, queue, marketplace];

  const hits: Hit[] = [
    ...bizRows.map((b) => ({
      kind: "business" as const,
      id: b.id,
      title: b.name,
      sub: b.sub ?? undefined,
      href: `/${slug}/business/${b.slug}`,
    })),
    ...agentRows.map((a) => ({
      kind: "agent" as const,
      id: a.id,
      title: a.name,
      sub: a.provider,
      href: a.business_id
        ? `/${slug}/business/${a.business_id}/agents`
        : `/${slug}/dashboard`,
    })),
    ...queueRows.map((qi) => ({
      kind: "queue" as const,
      id: qi.id,
      title: qi.title,
      sub: locale ? queueStateLabel(locale, qi.state) : qi.state,
      href: `/${slug}/business/${qi.business_id}`,
    })),
    ...marketplaceRows.map((m) => ({
      kind: "marketplace" as const,
      id: m.id,
      title: m.name,
      sub: `${m.marketplace_kind} · ${m.tagline}`,
      href: `/${slug}/marketplace`,
    })),
  ];

  return NextResponse.json({ hits });
}

function normalizeLocale(value: string | null): Locale | null {
  return value && LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

async function resolveBusinessScopeId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  business: string,
): Promise<string> {
  if (isUuid(business)) return business;
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("slug", business)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? business;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function translateMarketplaceRows<
  T extends {
    id: string;
    name: string;
    tagline: string;
    marketplace_kind: string;
  },
>(
  workspaceId: string,
  locale: Locale,
  rows: T[],
  userId: string,
): Promise<T[]> {
  const copies = rows.map((row) => ({ ...row }));
  const inputs: Array<{
    sourceKind: string;
    sourceId: string;
    field: string;
    text: string;
  }> = [];
  const setters: Array<(value: string) => void> = [];

  for (const row of copies) {
    inputs.push({
      sourceKind: "marketplace_agent",
      sourceId: row.id,
      field: "name",
      text: row.name,
    });
    setters.push((value) => {
      row.name = value;
    });
    inputs.push({
      sourceKind: "marketplace_agent",
      sourceId: row.id,
      field: "tagline",
      text: row.tagline,
    });
    setters.push((value) => {
      row.tagline = value;
    });
  }

  const values = await translateContentBatch(workspaceId, locale, inputs, {
    credentialOwnerUserId: userId,
  });
  values.forEach((value, index) => setters[index]?.(value));
  return copies;
}

function queueStateLabel(locale: Locale, state: string): string {
  const key =
    state === "review"
      ? "queue.state.review"
      : state === "fail"
        ? "queue.state.fail"
        : state === "auto"
          ? "queue.state.auto"
          : null;
  return key ? translate(locale, key) : state;
}
