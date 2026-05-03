// Reads of the nav_nodes tree. RLS scopes everything to the workspace
// the caller is a member of.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type NavNode = {
  id: string;
  workspace_id: string;
  business_id: string;
  parent_id: string | null;
  name: string;
  sub: string | null;
  letter: string;
  variant: string;
  icon: string | null;
  color_hex: string | null;
  logo_url: string | null;
  href: string | null;
  sort_order: number;
};

/** Returns the immediate children of a node (or the business root when
 *  parent_id is null). */
export async function listNavNodes(
  businessId: string,
  parentId: string | null = null,
): Promise<NavNode[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("nav_nodes")
    .select(
      "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, color_hex, logo_url, href, sort_order",
    )
    .eq("business_id", businessId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (parentId === null) q = q.is("parent_id", null);
  else q = q.eq("parent_id", parentId);
  const { data, error } = await q;
  if (error) {
    console.error("listNavNodes failed", error);
    return [];
  }
  return (data ?? []) as NavNode[];
}

/** Resolves a path of node ids into the actual node objects, in order.
 *  Used to build the rail breadcrumb when the URL is
 *  /business/[bizId]/n/<id1>/<id2>/<id3>. */
export async function resolveNavPath(
  businessId: string,
  ids: string[],
): Promise<NavNode[]> {
  if (ids.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("nav_nodes")
    .select(
      "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, color_hex, logo_url, href, sort_order",
    )
    .eq("business_id", businessId)
    .in("id", ids);
  if (error || !data) return [];
  // Preserve the URL order (postgres returns in arbitrary order for IN).
  const byId = new Map(
    (data as NavNode[]).map((n) => [n.id, n]),
  );
  return ids.map((id) => byId.get(id)).filter((n): n is NavNode => !!n);
}

/** Flattens the entire nav_nodes tree for a business into a single
 *  ordered list with `depth` precomputed — feeds the topic-pin select
 *  in the agent edit dialog. Cheap: businesses rarely have more than
 *  a few dozen topics so we just fetch all and walk client-side. */
export async function listFlatNavNodes(
  businessId: string,
): Promise<{ id: string; name: string; depth: number }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("nav_nodes")
    .select("id, parent_id, name, sort_order")
    .eq("business_id", businessId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listFlatNavNodes failed", error);
    return [];
  }
  type Row = {
    id: string;
    parent_id: string | null;
    name: string;
    sort_order: number;
  };
  const rows = data as Row[];
  const byParent = new Map<string | null, Row[]>();
  for (const r of rows) {
    const k = r.parent_id ?? null;
    const list = byParent.get(k) ?? [];
    list.push(r);
    byParent.set(k, list);
  }
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    const kids = byParent.get(parent) ?? [];
    for (const k of kids) {
      out.push({ id: k.id, name: k.name, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Returns the rootId + every descendant nav_node id under it, via
 *  the SECURITY INVOKER `descendant_nav_node_ids` SQL function from
 *  migration 043. Used by topic-scoped dashboards / schedules / runs
 *  queries to roll up sub-topics under a parent topic.
 *
 *  Returns just `[rootId]` on RPC failure so callers degrade to the
 *  leaf topic instead of crashing the whole dashboard. */
export async function listDescendantNavNodeIds(
  rootId: string,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("descendant_nav_node_ids", {
    _root: rootId,
  });
  if (error || !data) {
    console.error("listDescendantNavNodeIds failed", error);
    return [rootId];
  }
  type Row = { id: string };
  return (data as Row[]).map((r) => r.id);
}
