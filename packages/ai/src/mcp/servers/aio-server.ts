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

// Tables/RPCs live in the aio_control schema; we keep a separate client
// pinned there for telegram routing + key resolution. The default
// `public`-schema client above handles the legacy read tools.
const supabaseAio = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "aio_control" },
});

// ── Input schemas (Zod) ────────────────────────────────────────────────────
const ListAgentsSchema = z.object({
  scope: z.enum(["all", "global", "business"]).optional().default("all"),
  business_id: z.string().uuid().optional(),
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
  label: z.string().min(1).max(80),
  html_content: z.string().min(10),
});

const UpsertCustomTabSchema = z.object({
  business_id: z.string().uuid(),
  label: z.string().min(1).max(80),
  url: z.string().url(),
  sort_order: z.coerce.number().int().optional().default(0),
});

const ListCustomTabsSchema = z.object({
  business_id: z.string().uuid(),
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

// ── Tool implementations ─────────────────────────────────────────────────────

async function listBusinesses(): Promise<string> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, sub, icon, variant, status, created_at")
    .eq("workspace_id", WORKSPACE_ID)
    .order("created_at", { ascending: false });

  if (error) {
    return JSON.stringify({ error: "db_error", message: error.message });
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

  let query = supabase
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

  let query = supabase
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
  const { business_id, label, html_content } = parsed.data;

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

  // Upsert the custom_tabs row so the dashboard appears as a nav tab.
  const tabResult = await upsertCustomTabInner(business_id, label, url, 0);
  if (tabResult.error) {
    return JSON.stringify({ error: "tab_upsert_failed", message: tabResult.error, url });
  }

  return JSON.stringify({ ok: true, url, tab_id: tabResult.tab_id, slug });
}

async function upsertCustomTabInner(
  business_id: string,
  label: string,
  url: string,
  sort_order: number,
): Promise<{ tab_id?: string; error?: string }> {
  const { data: existing } = await supabaseAio
    .from("custom_tabs")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", business_id)
    .eq("label", label)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAio
      .from("custom_tabs")
      .update({ url, sort_order })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    return { tab_id: existing.id as string };
  }

  const { data, error } = await supabaseAio
    .from("custom_tabs")
    .insert({ workspace_id: WORKSPACE_ID, business_id, label, url, sort_order })
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
  const { business_id, label, url, sort_order } = parsed.data;
  const result = await upsertCustomTabInner(business_id, label, url, sort_order);
  if (result.error) return JSON.stringify({ error: "db_error", message: result.error });
  return JSON.stringify({ ok: true, tab_id: result.tab_id });
}

async function listCustomTabs(args: unknown): Promise<string> {
  const parsed = ListCustomTabsSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { business_id } = parsed.data;
  const { data, error } = await supabaseAio
    .from("custom_tabs")
    .select("id, label, url, sort_order, created_at")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", business_id)
    .order("sort_order", { ascending: true });
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
        "Gebruik voor rijke visuele samenvattingen, statistieken, KPI-overzichten.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description: "UUID van de business waarvoor het dashboard gemaakt wordt.",
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
              "Mag inline CSS en vanilla JS bevatten. Geen externe iframes.",
          },
        },
        required: ["business_id", "label", "html_content"],
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
            description: "UUID van de business.",
          },
        },
        required: ["business_id"],
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
