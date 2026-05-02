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
