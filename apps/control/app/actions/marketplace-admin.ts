// Server actions for the /admin/marketplace page. Lets the admin
// import from a curated list of public catalogs:
//
//   - github.com/modelcontextprotocol/servers          (official MCP)
//   - github.com/msitarzewski/agency-agents            (OpenAI Agents)
//   - github.com/forrestchang/andrej-karpathy-skills   (Karpathy skills)
//   - github.com/mattpocock/skills                     (Matt Pocock skills)
//   - mcpservers.org / mcp.so                          (community catalogs)
//
// The importer writes to marketplace_agents with source_url +
// source_provider populated so the catalog row is traceable. Only
// workspace owners (is_admin OR owner of any workspace) can call
// these actions.

"use server";

import { revalidatePath } from "next/cache";

import { getServiceRoleSupabase } from "../../lib/supabase/service";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function requireAdmin(): Promise<{
  ok: true;
  userId: string;
} | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  // For now: allow anyone who owns a workspace to import. We can
  // tighten to is_admin once the admin role flow is in place.
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1);
  if (!data || data.length === 0) {
    return { ok: false, error: "Alleen workspace owners/admins." };
  }
  return { ok: true, userId: user.id };
}

export type ImportItem = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  marketplace_kind: "agent" | "skill" | "plugin" | "mcp_server";
  provider: string;
  model?: string;
  kind?: string;
  category?: string;
  config?: Record<string, unknown>;
  source_url: string;
  source_provider: string;
};

export async function importMarketplaceItems(
  items: ImportItem[],
): Promise<Result<{ inserted: number; updated: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleSupabase();

  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const { data: existing } = await supabase
      .from("marketplace_agents")
      .select("id")
      .eq("slug", item.slug)
      .maybeSingle();

    const row = {
      slug: item.slug,
      name: item.name,
      tagline: item.tagline,
      description: item.description,
      provider: item.provider,
      model: item.model ?? null,
      kind: item.kind ?? "generator",
      config: item.config ?? {},
      category: item.category ?? null,
      official: false,
      marketplace_kind: item.marketplace_kind,
      source_url: item.source_url,
      source_provider: item.source_provider,
      imported_at: new Date().toISOString(),
      imported_by: auth.userId,
    };

    if (existing) {
      const { error } = await supabase
        .from("marketplace_agents")
        .update(row)
        .eq("id", existing.id);
      if (!error) updated++;
    } else {
      const { error } = await supabase
        .from("marketplace_agents")
        .insert(row);
      if (!error) inserted++;
    }
  }

  revalidatePath("/admin/marketplace");
  return { ok: true, data: { inserted, updated } };
}

export async function deleteMarketplaceItem(input: {
  id: string;
}): Promise<Result<null>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleSupabase();
  const { error } = await supabase
    .from("marketplace_agents")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/marketplace");
  return { ok: true, data: null };
}
