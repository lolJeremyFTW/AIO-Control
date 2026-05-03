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

/**
 * Upload a single skill (.md file content + filename) from the user's
 * laptop into the marketplace. We parse the YAML frontmatter inline —
 * no new deps — and treat anything else as the body description.
 *
 * Frontmatter we care about:
 *   ---
 *   name: ultraflow
 *   description: Default werkwijze voor élk substantieel dev-werk
 *   when_to_use: ...
 *   tags: [dev, planning]
 *   ---
 */
export async function importLocalSkill(input: {
  /** Raw SKILL.md content. Frontmatter optional. */
  content: string;
  /** Original filename (used as a fallback name + slug seed). */
  filename: string;
}): Promise<Result<{ slug: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!input.content?.trim()) {
    return { ok: false, error: "Lege skill — geen content meegegeven." };
  }

  const parsed = parseFrontmatter(input.content);
  const baseName = (input.filename ?? "skill")
    .replace(/\.[^.]+$/, "")
    .replace(/[/\\]/g, "-");
  const name =
    (parsed.frontmatter.name as string | undefined)?.trim() || baseName;
  const description =
    (parsed.frontmatter.description as string | undefined)?.trim() ||
    parsed.body.split("\n").find((l) => l.trim().length > 0)?.trim() ||
    "Lokaal geüploade skill.";
  const tagline =
    description.length > 120 ? description.slice(0, 117) + "…" : description;
  const slug = `local-${slugify(name)}`;

  const item: ImportItem = {
    slug,
    name,
    tagline,
    description,
    marketplace_kind: "skill",
    provider: "claude",
    kind: "generator",
    category: "local",
    config: {
      // Stash the full markdown body so the marketplace card can
      // surface "view source" without us needing object storage yet.
      // ~few KB per skill — fits comfortably in the existing jsonb
      // column.
      source: input.filename,
      content: input.content,
      frontmatter: parsed.frontmatter,
    },
    source_url: `local://${input.filename}`,
    source_provider: "local-upload",
  };

  const res = await importMarketplaceItems([item]);
  if (!res.ok) return res;
  return { ok: true, data: { slug } };
}

/** Tiny inline frontmatter parser — pulls `key: value` pairs from the
 *  block delimited by `---` lines at the top of the file. Values can
 *  be unquoted strings, quoted strings, or YAML-style flow lists
 *  (`[a, b, c]`). Anything more elaborate (block lists, nested maps)
 *  ends up as a raw string the caller can post-process. */
function parseFrontmatter(text: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: text };
  const fm: Record<string, unknown> = {};
  for (const line of m[1]!.split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!.trim();
    const raw = kv[2]!.trim();
    if (raw === "") {
      fm[key] = "";
      continue;
    }
    // Strip wrapping quotes.
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      fm[key] = raw.slice(1, -1);
      continue;
    }
    // Flow-style list.
    if (raw.startsWith("[") && raw.endsWith("]")) {
      fm[key] = raw
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      continue;
    }
    fm[key] = raw;
  }
  return { frontmatter: fm, body: m[2] ?? "" };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
