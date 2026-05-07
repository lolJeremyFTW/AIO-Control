// AIO Control MCP server — exposes core read tools as MCP tools.
// Runs as a standalone stdio subprocess spawned by McpHost.
//
// Tools: list_businesses, list_agents, list_runs. read_secret is opt-in via
// AIO_MCP_ALLOW_READ_SECRET=true because it returns plaintext.
// Security: SUPABASE_SERVICE_ROLE_KEY comes via env, never CLI args or stdout.
//
// Run: node packages/ai/src/mcp/servers/aio-server.js
// (compiled from TypeScript — use tsx in dev, or build for production)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ── Env validation ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKSPACE_ID = process.env.AIO_WORKSPACE_ID ?? "default";
const CURRENT_NAV_NODE_ID = process.env.AIO_NAV_NODE_ID ?? "";
const ALLOW_READ_SECRET = process.env.AIO_MCP_ALLOW_READ_SECRET === "true";
const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY ?? "";
const APP_ORIGIN = process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? "https://aio.tromptech.life";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Write to stderr so it doesn't corrupt the JSON-RPC stream
  console.error(
    "[aio-mcp] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env",
  );
  process.exit(1);
}

// ── Supabase client (service role — server-side only) ───────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "public" },
});

// AIO Control domain tables/RPCs live in the aio_control schema. The
// default `public` client is still used for legacy workspace_secrets.
const supabaseAio = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "aio_control" },
});

// ── Input schemas (Zod) ────────────────────────────────────────────────────
const ListAgentsSchema = z.object({
  scope: z.enum(["all", "global", "business"]).optional().default("all"),
  business_id: z.string().uuid().optional(),
});

const ListNavNodesSchema = z.object({
  business_id: z.string().uuid().optional(),
  search: z.string().min(1).optional(),
});

const ReadSecretSchema = z.object({
  name: z.string().min(1),
});

const ListRunsSchema = z.object({
  business_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z
    .enum(["queued", "running", "done", "failed", "review"])
    .optional(),
});

const PublishDashboardSchema = z.object({
  business_id: z.string().uuid(),
  nav_node_id: z.string().uuid().optional(),
  label: z.string().min(1).max(80),
  html_content: z.string().min(10),
});

const PublishTopicDashboardSchema = z.object({
  business: z.string().min(1),
  topic: z.string().min(1),
  label: z.string().min(1).max(80),
  html_content: z.string().min(10),
});

const UpsertCustomTabSchema = z.object({
  business_id: z.string().uuid(),
  nav_node_id: z.string().uuid().optional(),
  label: z.string().min(1).max(80),
  url: z.string().url(),
  sort_order: z.coerce.number().int().optional().default(0),
});

const ListCustomTabsSchema = z.object({
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().optional(),
});

const SendTelegramSchema = z.object({
  message: z.string().min(1).max(4000),
  /** Optional name of a configured telegram_targets row. When omitted
   *  we use the workspace's default enabled target. */
  target_name: z.string().optional(),
  /** Optional business_id — narrows token resolution to that
   *  business's override (per-business bot tokens). */
  business_id: z.string().uuid().optional(),
  /** parse_mode passed straight to Telegram. Default "Markdown". */
  parse_mode: z.enum(["Markdown", "MarkdownV2", "HTML"]).optional().default("Markdown"),
});

const AIO_DASHBOARD_STYLE_GUIDE = `
Use AIO Control dashboard styling only:
- Use CSS variables: --app-bg, --app-fg, --app-fg-2, --app-fg-3, --app-border, --app-border-2, --app-card, --app-card-2, --tt-green, --rose, --amber, --type.
- Support both body[data-theme="dark"] and body[data-theme="light"].
- Use compact KPI tiles, 8-12px radii, subtle borders, no unrelated gradients/orbs/stock visuals.
- Do not hardcode a dark-only or light-only palette; prefer var(...) for every surface/text/border.
- Match the AIO dashboard feel: quiet operator UI, card grid, dense tables, clear status pills.
`.trim();

function aioDashboardShell(html: string): string {
  const themeBoot = `<script>(function(){try{var t=localStorage.getItem('aio-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.body.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();<\/script>`;
  const style = `<style>
:root{color-scheme:dark;--tt-green:#39b255;--tt-green-soft:#6fd189;--rose:#e6526b;--amber:#ffb800;--app-bg:#15171a;--app-fg:#f0eee5;--app-fg-2:#b9b6a8;--app-fg-3:rgba(255,255,255,.55);--app-border:rgba(255,255,255,.1);--app-border-2:rgba(255,255,255,.06);--app-card:#1a1d1f;--app-card-2:rgba(255,255,255,.04);--type:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body[data-theme="light"]{color-scheme:light;--app-bg:#f6f4ee;--app-fg:#1a1c1a;--app-fg-2:#3b3d3a;--app-fg-3:#6a6c66;--app-border:#b6b3a6;--app-border-2:#dcd7c8;--app-card:#fff;--app-card-2:#f1eee3}
*{box-sizing:border-box}body{margin:0;background:var(--app-bg);color:var(--app-fg);font-family:var(--type);font-size:14px;line-height:1.45}main,.aio-dashboard{width:min(1180px,calc(100vw - 32px));margin:0 auto;padding:24px 0}section,.card,.tile,.panel{background:var(--app-card);border:1.5px solid var(--app-border);border-radius:10px}h1,h2,h3,p{margin-top:0}h1{font-size:24px;letter-spacing:0}h2{font-size:17px}h3{font-size:14px}a{color:var(--tt-green)}table{width:100%;border-collapse:collapse;background:var(--app-card);border:1px solid var(--app-border);border-radius:10px;overflow:hidden}th,td{padding:9px 10px;border-bottom:1px solid var(--app-border-2);text-align:left}th{font-size:11px;text-transform:uppercase;color:var(--app-fg-3);letter-spacing:.08em}button,.pill{border-radius:999px;border:1px solid var(--app-border);background:var(--app-card-2);color:var(--app-fg);padding:6px 10px}.muted{color:var(--app-fg-3)}.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpi,.tile{padding:12px 14px}.kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--app-fg-3);font-weight:700}.kpi-value{font-size:22px;font-weight:750;color:var(--app-fg)}@media(max-width:720px){main,.aio-dashboard{width:min(100vw - 20px,1180px);padding:14px 0}table{font-size:12px}}
</style>`;
  const input = html.trim();
  const withStyle = /<\/head>/i.test(input)
    ? input.replace(/<\/head>/i, `${style}</head>`)
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}</head><body>${input}</body></html>`;
  return /<body[^>]*>/i.test(withStyle)
    ? withStyle.replace(/<body([^>]*)>/i, `<body$1>${themeBoot}`)
    : withStyle.replace(/<\/head>/i, `</head><body>${themeBoot}</body>`);
}

// ── Tool implementations ─────────────────────────────────────────────────────

async function listBusinesses(): Promise<string> {
  const { data, error } = await supabaseAio
    .from("businesses")
    .select("id, name, sub, slug, icon, variant, status, created_at")
    .eq("workspace_id", WORKSPACE_ID)
    .order("created_at", { ascending: false });

  if (error) {
    // Some older/self-hosted installs have a stale PostgREST schema cache or
    // miss optional presentation columns. Keep the read tool useful instead of
    // failing the whole agent health check on a non-essential field.
    const missingOptionalColumn =
      error.code === "PGRST204" ||
      /column .*businesses\.(sub|slug|icon|variant|status).* does not exist/i.test(
        error.message,
      ) ||
      /could not find .* (sub|slug|icon|variant|status) .*businesses/i.test(
        error.message,
      );
    if (!missingOptionalColumn) {
      return JSON.stringify({ error: "db_error", message: error.message });
    }

    const fallback = await supabaseAio
      .from("businesses")
      .select("id, name, created_at")
      .eq("workspace_id", WORKSPACE_ID)
      .order("created_at", { ascending: false });
    if (fallback.error) {
      return JSON.stringify({
        error: "db_error",
        message: fallback.error.message,
      });
    }
    return JSON.stringify({
      businesses: (fallback.data ?? []).map((b) => ({
        ...b,
        sub: null,
        slug: null,
        icon: null,
        variant: null,
        status: null,
      })),
      warning: `businesses optional columns unavailable: ${error.message}`,
    });
  }
  return JSON.stringify({ businesses: data ?? [] });
}

async function listAgents(
  args: unknown,
): Promise<string> {
  const parsed = ListAgentsSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const { scope, business_id } = parsed.data;

  let query = supabaseAio
    .from("agents")
    .select("id, name, kind, provider, model, business_id, created_at")
    .eq("workspace_id", WORKSPACE_ID);

  if (scope === "global") {
    query = query.is("business_id", null);
  } else if (scope === "business" && business_id) {
    query = query.eq("business_id", business_id);
  }
  // scope === "all": no filter

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return JSON.stringify({ error: "db_error", message: error.message });
  }
  return JSON.stringify({ agents: data ?? [] });
}

async function listNavNodes(args: unknown): Promise<string> {
  const parsed = ListNavNodesSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const { business_id, search } = parsed.data;

  let query = supabaseAio
    .from("nav_nodes")
    .select("id, business_id, parent_id, slug, name, sub, href, sort_order")
    .eq("workspace_id", WORKSPACE_ID)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (business_id) query = query.eq("business_id", business_id);

  const { data, error } = await query;

  if (error) {
    return JSON.stringify({ error: "db_error", message: error.message });
  }

  const nodes = await withBusinessAndPath(data ?? []);
  const filtered = search
    ? nodes.filter((node) =>
        [node.name, node.slug, node.sub, node.business_name, node.path]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(search.toLowerCase()),
          ),
      )
    : nodes;

  return JSON.stringify({ nav_nodes: filtered });
}

type NavNodeLookupRow = {
  id: string;
  business_id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  sub: string | null;
  href: string | null;
  sort_order: number;
};

async function withBusinessAndPath(nodes: NavNodeLookupRow[]) {
  const businessIds = Array.from(new Set(nodes.map((n) => n.business_id)));
  const { data: businesses } = await supabaseAio
    .from("businesses")
    .select("id, name, slug")
    .eq("workspace_id", WORKSPACE_ID)
    .in("id", businessIds.length > 0 ? businessIds : ["00000000-0000-0000-0000-000000000000"]);

  const businessById = new Map(
    (businesses ?? []).map((b) => [
      b.id as string,
      { name: b.name as string, slug: b.slug as string | null },
    ]),
  );
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  function pathFor(node: NavNodeLookupRow): string {
    const parts: string[] = [];
    let current: NavNodeLookupRow | undefined = node;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.slug);
      current = current.parent_id ? nodeById.get(current.parent_id) : undefined;
    }
    return parts.join("/");
  }

  return nodes.map((node) => {
    const business = businessById.get(node.business_id);
    return {
      ...node,
      business_name: business?.name ?? null,
      business_slug: business?.slug ?? null,
      path: pathFor(node),
    };
  });
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

async function resolveBusinessTopic(
  businessRef: string,
  topicRef: string,
): Promise<
  | {
      business_id: string;
      business_name: string;
      business_slug: string | null;
      nav_node_id: string;
      topic_name: string;
      topic_slug: string;
      topic_path: string;
    }
  | { error: string; matches?: unknown[] }
> {
  const businessNeedle = norm(businessRef);
  const topicNeedle = norm(topicRef);

  const { data: businesses, error: bizError } = await supabaseAio
    .from("businesses")
    .select("id, name, slug, sub")
    .eq("workspace_id", WORKSPACE_ID)
    .order("created_at", { ascending: true });
  if (bizError) return { error: bizError.message };

  const businessMatches = (businesses ?? []).filter((b) =>
    [b.id, b.name, b.slug, b.sub]
      .filter(Boolean)
      .some((value) => norm(String(value)).includes(businessNeedle)),
  );
  if (businessMatches.length === 0) {
    return { error: `Business '${businessRef}' not found in current workspace.` };
  }
  if (businessMatches.length > 1) {
    return {
      error: `Business '${businessRef}' is ambiguous.`,
      matches: businessMatches.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
      })),
    };
  }

  const business = businessMatches[0]!;
  const { data: nodes, error: nodeError } = await supabaseAio
    .from("nav_nodes")
    .select("id, business_id, parent_id, slug, name, sub, href, sort_order")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", business.id)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (nodeError) return { error: nodeError.message };

  const decorated = await withBusinessAndPath((nodes ?? []) as NavNodeLookupRow[]);
  const topicMatches = decorated.filter((node) =>
    [node.id, node.name, node.slug, node.sub, node.path]
      .filter(Boolean)
      .some((value) => norm(String(value)).includes(topicNeedle)),
  );
  if (topicMatches.length === 0) {
    return {
      error: `Topic '${topicRef}' not found in business '${business.name}'.`,
    };
  }
  const exact =
    topicMatches.find((node) => norm(node.name) === topicNeedle) ??
    topicMatches.find((node) => norm(node.slug) === topicNeedle) ??
    topicMatches.find((node) => norm(node.path) === topicNeedle);
  if (!exact && topicMatches.length > 1) {
    return {
      error: `Topic '${topicRef}' is ambiguous in business '${business.name}'.`,
      matches: topicMatches.map((node) => ({
        id: node.id,
        name: node.name,
        slug: node.slug,
        path: node.path,
      })),
    };
  }

  const topic = exact ?? topicMatches[0]!;
  return {
    business_id: business.id as string,
    business_name: business.name as string,
    business_slug: (business.slug as string | null) ?? null,
    nav_node_id: topic.id,
    topic_name: topic.name,
    topic_slug: topic.slug,
    topic_path: topic.path,
  };
}

async function resolveTopic(args: unknown): Promise<string> {
  const parsed = z
    .object({ business: z.string().min(1), topic: z.string().min(1) })
    .safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const resolved = await resolveBusinessTopic(
    parsed.data.business,
    parsed.data.topic,
  );
  return JSON.stringify(resolved);
}

async function readSecret(args: unknown): Promise<string> {
  const parsed = ReadSecretSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const { name } = parsed.data;

  // workspace_secrets table: workspace_id, name, value
  const { data, error } = await supabase
    .from("workspace_secrets")
    .select("value")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("name", name.toUpperCase())
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found — return null, not an error
      return JSON.stringify({ value: null });
    }
    return JSON.stringify({ error: "db_error", message: error.message });
  }
  return JSON.stringify({ value: (data as { value: string }).value ?? null });
}

async function listRuns(args: unknown): Promise<string> {
  const parsed = ListRunsSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const { agent_id, business_id, limit, status } = parsed.data;

  let query = supabaseAio
    .from("runs")
    .select("id, agent_id, business_id, status, created_at, finished_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agent_id) query = query.eq("agent_id", agent_id);
  if (business_id) query = query.eq("business_id", business_id);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return JSON.stringify({ error: "db_error", message: error.message });
  }
  return JSON.stringify({ runs: data ?? [] });
}

function randomSlug(len = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function publishDashboard(args: unknown): Promise<string> {
  const parsed = PublishDashboardSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { business_id, label } = parsed.data;
  const html_content = aioDashboardShell(parsed.data.html_content);
  const navNodeId = parsed.data.nav_node_id ?? (CURRENT_NAV_NODE_ID || undefined);

  // Check if a dashboard with this label already exists for the business
  // so we can keep the same slug (stable URL on re-publish).
  const { data: existing } = await supabaseAio
    .from("agent_dashboards")
    .select("id, slug")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", business_id)
    .eq("label", label)
    .maybeSingle();

  let slug: string;
  if (existing) {
    slug = existing.slug as string;
    const { error } = await supabaseAio
      .from("agent_dashboards")
      .update({ html_content, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return JSON.stringify({ error: "db_error", message: error.message });
  } else {
    slug = randomSlug();
    const { error } = await supabaseAio.from("agent_dashboards").insert({
      workspace_id: WORKSPACE_ID,
      business_id,
      label,
      html_content,
      slug,
    });
    if (error) return JSON.stringify({ error: "db_error", message: error.message });
  }

  const url = `${APP_ORIGIN}/d/${slug}`;

  if (navNodeId) {
    const topicResult = await publishTopicDashboard({
      business_id,
      nav_node_id: navNodeId,
      label,
      html_content,
      public_url: url,
    });
    if (topicResult.error) {
      return JSON.stringify({
        error: "topic_publish_failed",
        message: topicResult.error,
        url,
        slug,
      });
    }
    return JSON.stringify({
      ok: true,
      url: topicResult.topic_url,
      public_url: url,
      tab_id: topicResult.tab_id,
      slug,
      nav_node_id: navNodeId,
    });
  }

  // Upsert the custom_tabs row so the dashboard appears as a nav tab.
  const tabResult = await upsertCustomTabInner(business_id, label, url, 0);
  if (tabResult.error) {
    return JSON.stringify({ error: "tab_upsert_failed", message: tabResult.error, url });
  }

  return JSON.stringify({ ok: true, url, tab_id: tabResult.tab_id, slug });
}

async function publishTopicDashboardByName(args: unknown): Promise<string> {
  const parsed = PublishTopicDashboardSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }

  const resolved = await resolveBusinessTopic(
    parsed.data.business,
    parsed.data.topic,
  );
  if ("error" in resolved) return JSON.stringify(resolved);

  return publishDashboard({
    business_id: resolved.business_id,
    nav_node_id: resolved.nav_node_id,
    label: parsed.data.label,
    html_content: parsed.data.html_content,
  });
}

async function publishTopicDashboard(input: {
  business_id: string;
  nav_node_id: string;
  label: string;
  html_content: string;
  public_url: string;
}): Promise<{ topic_url?: string; tab_id?: string; error?: string }> {
  const { data: biz, error: bizError } = await supabaseAio
    .from("businesses")
    .select("id, workspace_id, slug")
    .eq("id", input.business_id)
    .eq("workspace_id", WORKSPACE_ID)
    .maybeSingle();
  if (bizError) return { error: bizError.message };
  if (!biz) return { error: "Business not found in current workspace." };

  const { data: workspace, error: wsError } = await supabaseAio
    .from("workspaces")
    .select("slug")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  if (wsError) return { error: wsError.message };
  if (!workspace?.slug) return { error: "Workspace slug not found." };

  const chain = await navNodeSlugChain(input.nav_node_id, input.business_id);
  if ("error" in chain) return { error: chain.error };

  const topicPath = `/${workspace.slug}/business/${biz.slug}/n/${chain.slugs.join("/")}`;
  const topicUrl = `${APP_ORIGIN}${topicPath}`;
  const content = dashboardContentForTopic(input.label, input.html_content, input.public_url);

  const { error: dashboardError } = await supabaseAio
    .from("module_dashboards")
    .upsert(
      {
        nav_node_id: input.nav_node_id,
        workspace_id: WORKSPACE_ID,
        content,
        run_id: null,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "nav_node_id" },
    );
  if (dashboardError) return { error: dashboardError.message };

  const tabResult = await upsertCustomTabInner(
    input.business_id,
    input.label,
    input.public_url,
    0,
    input.nav_node_id,
  );
  if (tabResult.error) return { error: tabResult.error };
  return { topic_url: topicUrl, tab_id: tabResult.tab_id };
}

async function navNodeSlugChain(
  nav_node_id: string,
  business_id: string,
): Promise<{ slugs: string[] } | { error: string }> {
  const { data, error } = await supabaseAio
    .from("nav_nodes")
    .select("id, parent_id, business_id, slug")
    .eq("business_id", business_id);
  if (error) return { error: error.message };

  const nodes = new Map(
    (data ?? []).map((n) => [
      n.id as string,
      {
        parent_id: n.parent_id as string | null,
        slug: n.slug as string,
      },
    ]),
  );
  const slugs: string[] = [];
  let current: string | null = nav_node_id;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) return { error: "Cycle detected in nav_nodes." };
    seen.add(current);
    const node = nodes.get(current);
    if (!node) return { error: "Nav node not found for this business." };
    slugs.unshift(node.slug);
    current = node.parent_id;
  }
  return { slugs };
}

function dashboardContentForTopic(
  label: string,
  html: string,
  publicUrl: string,
): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  const preview = text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
  return [
    `# ${label}`,
    "",
    `[Open interactief dashboard](${publicUrl})`,
    "",
    preview,
  ]
    .filter(Boolean)
    .join("\n");
}

async function upsertCustomTabInner(
  business_id: string,
  label: string,
  url: string,
  sort_order: number,
  nav_node_id?: string,
): Promise<{ tab_id?: string; error?: string }> {
  let existingQuery = supabaseAio
    .from("custom_tabs")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", business_id)
    .eq("label", label);
  existingQuery = nav_node_id
    ? existingQuery.eq("nav_node_id", nav_node_id)
    : existingQuery.is("nav_node_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabaseAio
      .from("custom_tabs")
      .update({ url, sort_order, nav_node_id: nav_node_id ?? null })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    return { tab_id: existing.id as string };
  }

  const { data, error } = await supabaseAio
    .from("custom_tabs")
    .insert({
      workspace_id: WORKSPACE_ID,
      business_id,
      nav_node_id: nav_node_id ?? null,
      label,
      url,
      sort_order,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { tab_id: (data as { id: string }).id };
}

async function upsertCustomTab(args: unknown): Promise<string> {
  const parsed = UpsertCustomTabSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { business_id, nav_node_id, label, url, sort_order } = parsed.data;
  const result = await upsertCustomTabInner(
    business_id,
    label,
    url,
    sort_order,
    nav_node_id,
  );
  if (result.error) return JSON.stringify({ error: "db_error", message: result.error });
  return JSON.stringify({ ok: true, tab_id: result.tab_id });
}

async function listCustomTabs(args: unknown): Promise<string> {
  const parsed = ListCustomTabsSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { business_id, nav_node_id } = parsed.data;
  if (!business_id && !nav_node_id) {
    return JSON.stringify({
      error: "validation_failed",
      message: "business_id or nav_node_id is required",
    });
  }
  let query = supabaseAio
    .from("custom_tabs")
    .select("id, business_id, nav_node_id, label, url, sort_order, created_at")
    .eq("workspace_id", WORKSPACE_ID)
    .order("sort_order", { ascending: true });
  if (nav_node_id) query = query.eq("nav_node_id", nav_node_id);
  else if (business_id) query = query.eq("business_id", business_id).is("nav_node_id", null);
  const { data, error } = await query;
  if (error) return JSON.stringify({ error: "db_error", message: error.message });
  return JSON.stringify({ tabs: data ?? [] });
}

async function sendTelegramMessage(args: unknown): Promise<string> {
  const parsed = SendTelegramSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const { message, target_name, business_id, parse_mode } = parsed.data;

  if (!AGENT_SECRET_KEY) {
    return JSON.stringify({
      error: "config_missing",
      message: "AGENT_SECRET_KEY is not set in the MCP subprocess env",
    });
  }

  // 1. Pick the telegram target row. Prefer named, otherwise first
  //    enabled workspace-scope target.
  type TgTarget = { chat_id: string; topic_id: number | null; enabled: boolean };
  let target: TgTarget | null = null;
  if (target_name) {
    const { data, error } = await supabaseAio
      .from("telegram_targets")
      .select("chat_id, topic_id, enabled")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("name", target_name)
      .maybeSingle();
    if (error) {
      return JSON.stringify({ error: "db_error", message: error.message });
    }
    target = (data as unknown as TgTarget | null) ?? null;
  } else {
    const { data, error } = await supabaseAio
      .from("telegram_targets")
      .select("chat_id, topic_id, enabled")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("scope", "workspace")
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      return JSON.stringify({ error: "db_error", message: error.message });
    }
    target = (data as unknown as TgTarget | null) ?? null;
  }
  if (!target) {
    return JSON.stringify({
      error: "no_target",
      message:
        "geen telegram_target gevonden — configureer er één via Settings → Notifications",
    });
  }
  if (!target.enabled) {
    return JSON.stringify({ error: "target_disabled" });
  }

  // 2. Resolve the bot token via the resolve_api_key RPC (handles the
  //    workspace → business → navnode tier lookup + pgcrypto decrypt).
  const { data: tokenData, error: tokenErr } = await supabaseAio.rpc(
    "resolve_api_key",
    {
      _workspace_id: WORKSPACE_ID,
      _business_id: business_id ?? null,
      _nav_node_id: null,
      _provider: "telegram",
      _master_key: AGENT_SECRET_KEY,
    },
  );
  if (tokenErr) {
    return JSON.stringify({ error: "token_lookup_failed", message: tokenErr.message });
  }
  const token = tokenData as string | null;
  if (!token) {
    return JSON.stringify({
      error: "no_token",
      message:
        "geen Telegram bot token gevonden — voeg er één toe via Settings → API Keys (provider=telegram)",
    });
  }

  // 3. Send.
  const body: Record<string, unknown> = {
    chat_id: target.chat_id,
    text: message,
    parse_mode,
    disable_web_page_preview: true,
  };
  if (target.topic_id != null) {
    body.message_thread_id = target.topic_id;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return JSON.stringify({ error: "telegram_api", status: res.status, message: text });
    }
    return JSON.stringify({ ok: true, chat_id: target.chat_id });
  } catch (err) {
    return JSON.stringify({
      error: "network",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── MCP Server setup ─────────────────────────────────────────────────────────

const server = new Server(
  { name: "aio-control", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_businesses",
      description:
        "List all businesses in the current workspace. Returns id, name, sub, icon, variant, status, created_at.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "list_nav_nodes",
      description:
        "List topics/nav-nodes from local Supabase, including the business each topic belongs to and its path. Use search='outreach' or business_id to narrow results.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description:
              "Optionele UUID van de business waarvan je topics wil vinden. Laat leeg om topics van alle businesses te zien.",
          },
          search: {
            type: "string",
            description:
              "Optionele zoekterm, bijvoorbeeld 'outreach'. Zoekt in name, slug en sub.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "resolve_topic",
      description:
        "Resolve natural names from local Supabase to IDs. Example: business='TrompTechDesigns', topic='outreach' returns business_id, nav_node_id, business_slug, and topic path.",
      inputSchema: {
        type: "object",
        properties: {
          business: {
            type: "string",
            description: "Business name, slug, sub, or UUID.",
          },
          topic: {
            type: "string",
            description: "Topic/nav-node name, slug, path, or UUID.",
          },
        },
        required: ["business", "topic"],
        additionalProperties: false,
      },
    },
    {
      name: "list_agents",
      description:
        "List agents in the workspace. Filter by scope: all (default), global (no business), or business (scoped).",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["all", "global", "business"],
            default: "all",
            description: "Filter by agent scope.",
          },
          business_id: {
            type: "string",
            format: "uuid",
            description: "UUID of the business to filter by (when scope=business).",
          },
        },
        additionalProperties: false,
      },
    },
    ...(ALLOW_READ_SECRET
      ? [{
      name: "read_secret",
      description:
        "Read a workspace secret by its uppercase name. Returns plaintext and should only be enabled for trusted agents.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            description: "Exact name of the secret as configured.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    }]
      : []),
    {
      name: "send_telegram_message",
      description:
        "Send a Telegram message to the workspace's configured chat. Use this for mid-run notifications, alerts, or status pings — DO NOT shell out to curl. By default uses the workspace-default target; pass target_name to pick a specific configured target.",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            minLength: 1,
            maxLength: 4000,
            description:
              "Message body. Markdown by default — use *bold*, _italic_, `code`, [link](url).",
          },
          target_name: {
            type: "string",
            description:
              "Optional name of a configured telegram_targets row. Omit to use the workspace default.",
          },
          business_id: {
            type: "string",
            format: "uuid",
            description:
              "Optional business UUID — when set, resolves a per-business bot token override if configured.",
          },
          parse_mode: {
            type: "string",
            enum: ["Markdown", "MarkdownV2", "HTML"],
            default: "Markdown",
          },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
    {
      name: "publish_dashboard",
      description:
        "Sla een HTML-dashboard op en pin het als tab in de BusinessTabs-nav van de business. " +
        "Geeft {url, tab_id, slug} terug. Zelfde label = update HTML in-place (stabiele URL). " +
        "Gebruik voor rijke visuele samenvattingen, statistieken, KPI-overzichten. " +
        AIO_DASHBOARD_STYLE_GUIDE,
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description: "UUID van de business waarvoor het dashboard gemaakt wordt.",
          },
          nav_node_id: {
            type: "string",
            format: "uuid",
            description:
              "Optioneel topic/nav-node UUID. Gebruik dit wanneer de dashboard-vraag over een topic gaat, zoals Outreach. Als je agent aan een topic hangt, wordt dit automatisch gebruikt.",
          },
          label: {
            type: "string",
            maxLength: 80,
            description: "Tab-label dat in de nav verschijnt, bijv. 'YouTube stats' of 'Weekoverzicht'.",
          },
          html_content: {
            type: "string",
            description:
              "Volledige HTML-pagina (incl. <html>, <head>, <body>). " +
              "Mag inline CSS en vanilla JS bevatten. Geen externe iframes. " +
              "Gebruik AIO CSS variables en body[data-theme] voor light/dark compatibility.",
          },
        },
        required: ["business_id", "label", "html_content"],
        additionalProperties: false,
      },
    },
    {
      name: "publish_topic_dashboard",
      description:
        "Maak of update een HTML-dashboard voor een topic in een business, zonder UUIDs nodig te hebben. Voorbeeld: business='TrompTechDesigns', topic='outreach'. Het dashboard wordt opgeslagen, aan de topic-banner/tab gekoppeld en als publiek /d/<slug> dashboard beschikbaar gemaakt. " +
        AIO_DASHBOARD_STYLE_GUIDE,
      inputSchema: {
        type: "object",
        properties: {
          business: {
            type: "string",
            description: "Business name, slug, sub, or UUID.",
          },
          topic: {
            type: "string",
            description: "Topic/nav-node name, slug, path, or UUID.",
          },
          label: {
            type: "string",
            maxLength: 80,
            description:
              "Tab-label dat in de topic banner verschijnt, bijv. 'Test dashboard'.",
          },
          html_content: {
            type: "string",
            description:
              "Volledige HTML-pagina (incl. <html>, <head>, <body>). Mag inline CSS en vanilla JS bevatten. Gebruik AIO CSS variables en body[data-theme] voor light/dark compatibility.",
          },
        },
        required: ["business", "topic", "label", "html_content"],
        additionalProperties: false,
      },
    },
    {
      name: "upsert_custom_tab",
      description:
        "Pin een externe URL als iframe-tab in de BusinessTabs-nav van een business. " +
        "Gebruik dit wanneer je al een URL hebt (bijv. een externe dashboard-tool of rapport). " +
        "Voor HTML gegenereerd door de agent: gebruik publish_dashboard.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description: "UUID van de business.",
          },
          nav_node_id: {
            type: "string",
            format: "uuid",
            description:
              "Optionele topic/nav-node UUID. Gebruik dit om de tab in de topic banner te tonen in plaats van alleen op business-niveau.",
          },
          label: {
            type: "string",
            maxLength: 80,
            description: "Tab-label in de nav.",
          },
          url: {
            type: "string",
            format: "uri",
            description: "URL om in te embedden als iframe.",
          },
          sort_order: {
            type: "number",
            default: 0,
            description: "Volgorde t.o.v. andere custom tabs (laag = eerder).",
          },
        },
        required: ["business_id", "label", "url"],
        additionalProperties: false,
      },
    },
    {
      name: "list_custom_tabs",
      description: "Geeft de bestaande custom (iframe) tabs van een business terug.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description: "Optionele UUID van de business.",
          },
          nav_node_id: {
            type: "string",
            format: "uuid",
            description: "Optionele UUID van het topic/de nav-node.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "list_runs",
      description:
        "Recent agent runs. Useful for diagnosing failures or summarising activity.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description: "Filter to a specific business id.",
          },
          agent_id: {
            type: "string",
            format: "uuid",
            description: "Filter to a specific agent id.",
          },
          limit: {
            type: "number",
            default: 20,
            minimum: 1,
            maximum: 100,
            description: "Max number of runs to return (default 20, max 100).",
          },
          status: {
            type: "string",
            enum: ["queued", "running", "done", "failed", "review"],
            description: "Filter by run status.",
          },
        },
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params as {
    name: string;
    arguments: unknown;
  };

  let result: string;
  switch (name) {
    case "list_businesses":
      result = await listBusinesses();
      break;
    case "list_agents":
      result = await listAgents(args);
      break;
    case "list_nav_nodes":
      result = await listNavNodes(args);
      break;
    case "resolve_topic":
      result = await resolveTopic(args);
      break;
    case "read_secret":
      if (!ALLOW_READ_SECRET) {
        result = JSON.stringify({ error: "read_secret_disabled" });
        break;
      }
      result = await readSecret(args);
      break;
    case "list_runs":
      result = await listRuns(args);
      break;
    case "publish_dashboard":
      result = await publishDashboard(args);
      break;
    case "publish_topic_dashboard":
      result = await publishTopicDashboardByName(args);
      break;
    case "upsert_custom_tab":
      result = await upsertCustomTab(args);
      break;
    case "list_custom_tabs":
      result = await listCustomTabs(args);
      break;
    case "send_telegram_message":
      result = await sendTelegramMessage(args);
      break;
    default:
      result = JSON.stringify({ error: "unknown_tool", name });
  }

  // Return as text content block — McpHost.call() flattens these
  return { content: [{ type: "text", text: result }] };
});

// ── Main ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("[aio-mcp] Fatal connection error:", err);
  process.exit(1);
});
