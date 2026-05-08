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
import { createRoutine, deleteRoutine } from "../../routines";

// ── Env validation ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKSPACE_ID = process.env.AIO_WORKSPACE_ID ?? "default";
const CURRENT_BUSINESS_ID = process.env.AIO_BUSINESS_ID ?? "";
const CURRENT_NAV_NODE_ID = process.env.AIO_NAV_NODE_ID ?? "";
const CURRENT_AGENT_ID = process.env.AIO_AGENT_ID ?? "";
const CURRENT_RUN_ID = process.env.AIO_RUN_ID ?? "";
const ALLOW_READ_SECRET = process.env.AIO_MCP_ALLOW_READ_SECRET === "true";
const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY ?? "";
const CANONICAL_DASHBOARD_ORIGIN = "https://aio.tromptech.life";
const APP_ORIGIN = dashboardOrigin(
  process.env.AIO_DASHBOARD_ORIGIN ??
    process.env.NEXT_PUBLIC_DASHBOARD_ORIGIN ??
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN,
);

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
function dashboardOrigin(value: string | undefined): string {
  const raw = (value || CANONICAL_DASHBOARD_ORIGIN).replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    const pathname = url.pathname || "/";
    if (
      url.hostname === "tromptech.life" &&
      (pathname === "/" || pathname === "/aio")
    ) {
      return CANONICAL_DASHBOARD_ORIGIN;
    }
    return url.origin + (pathname === "/" ? "" : pathname);
  } catch {
    return CANONICAL_DASHBOARD_ORIGIN;
  }
}

function normalizeCustomTabUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.startsWith("/d/")) return `${APP_ORIGIN}${trimmed}`;
  if (trimmed.startsWith("/aio/d/")) return `${APP_ORIGIN}${trimmed.slice(4)}`;
  try {
    const url = new URL(trimmed);
    const dashboardPath = url.pathname.startsWith("/aio/d/")
      ? url.pathname.slice(4)
      : url.pathname;
    if (dashboardPath.startsWith("/d/")) {
      return `${APP_ORIGIN}${dashboardPath}${url.search}${url.hash}`;
    }
  } catch {
    // Schema validation catches invalid URLs for MCP calls; keep this helper
    // non-throwing so callers can still surface the original validation error.
  }
  return value;
}

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

const BusinessOperatingSnapshotSchema = z.object({
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().nullable().optional(),
  recent_runs_limit: z.coerce.number().int().min(1).max(50).optional().default(12),
});

const ListRunsSchema = z.object({
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().nullable().optional(),
  agent_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z
    .enum(["queued", "running", "done", "failed", "review"])
    .optional(),
});

const ListReviewLearningsSchema = z.object({
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().nullable().optional(),
  agent_id: z.string().uuid().optional(),
  outcome: z
    .enum(["pending", "approved", "rejected", "resolved", "noted"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const RequestHumanReviewSchema = z.object({
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().nullable().optional(),
  title: z.string().min(3).max(160),
  reason: z.string().min(3).max(2000),
  proposed_action: z.string().max(2000).optional(),
  risk_level: z.enum(["low", "medium", "high"]).optional().default("medium"),
  confidence: z.coerce.number().min(0).max(1).optional().default(0.5),
  state: z.enum(["review", "fail"]).optional().default("review"),
  payload: z.record(z.unknown()).optional(),
});

const PublishDashboardSchema = z.object({
  business_id: z.string().uuid(),
  nav_node_id: z.string().uuid().optional(),
  label: z.string().min(1).max(80),
  html_content: z.string().min(10),
});

const ListSchedulesSchema = z.object({
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  kind: z.enum(["cron", "webhook", "manual"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const CreateCronScheduleSchema = z.object({
  agent_id: z.string().uuid(),
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().nullable().optional(),
  cron_expr: z.string().min(3).max(80),
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  instructions: z.string().min(1),
  timezone: z.string().min(1).max(80).optional().default("Europe/Amsterdam"),
  enabled: z.boolean().optional().default(true),
});

const UpdateScheduleSchema = z.object({
  schedule_id: z.string().uuid(),
  patch: z.object({
    agent_id: z.string().uuid().optional(),
    business_id: z.string().uuid().nullable().optional(),
    nav_node_id: z.string().uuid().nullable().optional(),
    cron_expr: z.string().min(3).max(80).optional(),
    title: z.string().min(1).max(120).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    instructions: z.string().min(1).nullable().optional(),
    timezone: z.string().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
  }),
});

const ToggleScheduleSchema = z.object({
  schedule_id: z.string().uuid(),
  enabled: z.boolean(),
});

const DeleteScheduleSchema = z.object({
  schedule_id: z.string().uuid(),
});

const RunScheduleNowSchema = z.object({
  schedule_id: z.string().uuid(),
  prompt: z.string().min(1).optional(),
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

const ProposeImprovementSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(4000),
  business_id: z.string().uuid().optional(),
  nav_node_id: z.string().uuid().nullable().optional(),
  expected_impact: z.string().max(1000).optional(),
  evidence: z.string().max(2000).optional(),
});

const AIO_DASHBOARD_STYLE_GUIDE = `
Use AIO Control dashboard styling only:
- Return a dashboard fragment by default: one <main class="aio-dashboard">...</main> with optional scoped <style>. Do not build a standalone marketing page.
- The dashboard is embedded inside the existing AIO business/topic shell; do not add your own global navigation, browser-sized blank canvas, or unrelated page chrome.
- Use CSS variables: --app-bg, --app-fg, --app-fg-2, --app-fg-3, --app-border, --app-border-2, --app-card, --app-card-2, --tt-green, --rose, --amber, --type.
- Support both body[data-theme="dark"] and body[data-theme="light"].
- Use compact KPI tiles, 8-12px radii, subtle borders, no unrelated gradients/orbs/stock visuals.
- Follow the ghost.md visual rule for icons: do not use emoji as icons or status glyphs. Use small inline SVG line icons, text labels, initials, or CSS-drawn dots/pills instead.
- If you need dashboard icon examples, use simple 16px SVG strokes that inherit currentColor (chart, list, inbox, robot, calendar, external-link). Keep them quiet and consistent with the AIO icon registry style.
- Do not hardcode a dark-only or light-only palette; prefer var(...) for every surface/text/border.
- Match the AIO dashboard feel: quiet operator UI, card grid, dense tables, clear status pills.
- When this is for a topic (for example Outreach), pass nav_node_id or use publish_topic_dashboard so it appears as a topic tab instead of only a separate public URL.
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

type BusinessTarget = {
  id?: string;
  name?: string;
  target?: string;
  current?: string;
  deadline?: string | null;
  status?: "open" | "done" | "abandoned";
  notes?: string;
};

function parseTargets(value: unknown): BusinessTarget[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      target: typeof item.target === "string" ? item.target : undefined,
      current: typeof item.current === "string" ? item.current : undefined,
      deadline:
        typeof item.deadline === "string" || item.deadline === null
          ? item.deadline
          : undefined,
      status:
        item.status === "done" || item.status === "abandoned"
          ? item.status
          : "open",
      notes: typeof item.notes === "string" ? item.notes : undefined,
    }));
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function resolveOperatingScope(input: {
  business_id?: string;
  nav_node_id?: string | null;
}): Promise<{ business_id: string; nav_node_id: string | null } | { error: string }> {
  const navNodeId =
    input.nav_node_id === null
      ? null
      : input.nav_node_id ?? (CURRENT_NAV_NODE_ID || null);
  let businessId = input.business_id ?? (CURRENT_BUSINESS_ID || null);

  if (navNodeId) {
    const { data: node, error } = await supabaseAio
      .from("nav_nodes")
      .select("id, business_id")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("id", navNodeId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!node) return { error: "nav_node_id not found in current workspace." };
    const nodeBusinessId = node.business_id as string;
    if (businessId && businessId !== nodeBusinessId) {
      return { error: "nav_node_id belongs to a different business_id." };
    }
    businessId = nodeBusinessId;
  }

  if (businessId) {
    const { data: business, error } = await supabaseAio
      .from("businesses")
      .select("id")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("id", businessId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!business) return { error: "business_id not found in current workspace." };
    return { business_id: businessId, nav_node_id: navNodeId };
  }

  const { data: businesses, error } = await supabaseAio
    .from("businesses")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .is("archived_at", null)
    .limit(2);
  if (error) return { error: error.message };
  if ((businesses ?? []).length === 1) {
    return { business_id: businesses![0]!.id as string, nav_node_id: navNodeId };
  }
  return {
    error:
      "business_id is required because this workspace has multiple businesses and the agent is not business-scoped.",
  };
}

async function getBusinessOperatingSnapshot(args: unknown): Promise<string> {
  const parsed = BusinessOperatingSnapshotSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }

  const scope = await resolveOperatingScope({
    business_id: parsed.data.business_id,
    nav_node_id: parsed.data.nav_node_id,
  });
  if ("error" in scope) {
    return JSON.stringify({ error: "scope_error", message: scope.error });
  }

  let runsQuery = supabaseAio
    .from("runs")
    .select(
      "id, agent_id, schedule_id, nav_node_id, triggered_by, status, created_at, started_at, ended_at, duration_ms, cost_cents, error_text",
    )
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", scope.business_id)
    .order("created_at", { ascending: false })
    .limit(parsed.data.recent_runs_limit);
  if (scope.nav_node_id) runsQuery = runsQuery.eq("nav_node_id", scope.nav_node_id);

  let schedulesQuery = supabaseAio
    .from("schedules")
    .select(
      "id, agent_id, business_id, nav_node_id, kind, cron_expr, enabled, last_fired_at, title, description, instructions, timezone",
    )
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", scope.business_id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (scope.nav_node_id) {
    schedulesQuery = schedulesQuery.eq("nav_node_id", scope.nav_node_id);
  }

  let queueQuery = supabaseAio
    .from("queue_items")
    .select("id, nav_node_id, state, confidence, title, created_at")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("business_id", scope.business_id)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (scope.nav_node_id) queueQuery = queueQuery.eq("nav_node_id", scope.nav_node_id);

  const [businessRes, kpiRes, agentsRes, schedulesRes, runsRes, queueRes] =
    await Promise.all([
      supabaseAio
        .from("businesses")
        .select(
          "id, name, sub, slug, status, description, mission, targets, daily_spend_limit_cents, monthly_spend_limit_cents",
        )
        .eq("workspace_id", WORKSPACE_ID)
        .eq("id", scope.business_id)
        .maybeSingle(),
      supabaseAio
        .from("business_kpis_view")
        .select("period, usage_eur, revenue_eur, runs_count")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("business_id", scope.business_id),
      supabaseAio
        .from("agents")
        .select("id, name, kind, provider, model, business_id, nav_node_id")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("business_id", scope.business_id)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      schedulesQuery,
      runsQuery,
      queueQuery,
    ]);

  if (businessRes.error) {
    return JSON.stringify({ error: "db_error", message: businessRes.error.message });
  }
  if (!businessRes.data) {
    return JSON.stringify({ error: "not_found", message: "business not found." });
  }
  for (const res of [kpiRes, agentsRes, schedulesRes, runsRes, queueRes]) {
    if (res.error) {
      return JSON.stringify({ error: "db_error", message: res.error.message });
    }
  }

  const targets = parseTargets((businessRes.data as Record<string, unknown>).targets);
  const activeTargets = targets.filter((target) => (target.status ?? "open") === "open");
  const doneTargets = targets.filter((target) => target.status === "done");
  const kpis = ((kpiRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    period: row.period,
    usage_eur: asNumber(row.usage_eur),
    revenue_eur: asNumber(row.revenue_eur),
    runs_count: asNumber(row.runs_count),
  }));
  const kpiByPeriod = new Map(kpis.map((row) => [String(row.period), row]));
  const k30 = kpiByPeriod.get("30D");
  const k7 = kpiByPeriod.get("7D");
  const k24 = kpiByPeriod.get("24H");
  const runs = (runsRes.data ?? []) as Array<Record<string, unknown>>;
  const failedRecent = runs.filter((run) => run.status === "failed").length;
  const runningRecent = runs.filter((run) => run.status === "running").length;
  const queuedRecent = runs.filter((run) => run.status === "queued").length;

  return JSON.stringify({
    scope,
    business: businessRes.data,
    targets: {
      active: activeTargets,
      done: doneTargets,
      all: targets,
    },
    kpis,
    summary: {
      revenue_30d_eur: k30?.revenue_eur ?? 0,
      ai_cost_30d_eur: k30?.usage_eur ?? 0,
      margin_30d_eur: (k30?.revenue_eur ?? 0) - (k30?.usage_eur ?? 0),
      revenue_7d_eur: k7?.revenue_eur ?? 0,
      ai_cost_7d_eur: k7?.usage_eur ?? 0,
      runs_24h: k24?.runs_count ?? 0,
      open_target_count: activeTargets.length,
      open_queue_count: (queueRes.data ?? []).length,
      recent_failed_runs: failedRecent,
      recent_running_runs: runningRecent,
      recent_queued_runs: queuedRecent,
    },
    agents: agentsRes.data ?? [],
    schedules: schedulesRes.data ?? [],
    recent_runs: runs,
    open_queue: queueRes.data ?? [],
    control_loop_contract: {
      purpose:
        "Use this snapshot at the start of each main-loop run to plan against targets and KPIs.",
      cycle:
        "Pick one bottleneck, take one safe action or create one concrete proposal, then stop. Do not start an infinite loop inside a run.",
      safe_actions: [
        "publish_dashboard or send_telegram_message with a concise status report",
        "update/toggle/create schedules only when the agent has aio read-write permission",
        "propose_improvement, when available, for new agents, skills, integrations, dashboards, or risky strategy changes",
        "request human review or report back if the next action is high-risk or needs operator judgement",
      ],
    },
  });
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
    .select("id, name, kind, provider, model, business_id, nav_node_id, created_at")
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
  const businessId = business_id ?? (CURRENT_BUSINESS_ID || undefined);
  const navNodeId =
    parsed.data.nav_node_id === null
      ? undefined
      : parsed.data.nav_node_id ?? (CURRENT_NAV_NODE_ID || undefined);

  let query = supabaseAio
    .from("runs")
    .select(
      "id, agent_id, business_id, nav_node_id, status, created_at, started_at, finished_at:ended_at, duration_ms, cost_cents, error_text",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agent_id) query = query.eq("agent_id", agent_id);
  if (businessId) query = query.eq("business_id", businessId);
  if (navNodeId) query = query.eq("nav_node_id", navNodeId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return JSON.stringify({ error: "db_error", message: error.message });
  }
  return JSON.stringify({ runs: data ?? [] });
}

async function listReviewLearnings(args: unknown): Promise<string> {
  const parsed = ListReviewLearningsSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const businessId = parsed.data.business_id ?? (CURRENT_BUSINESS_ID || null);
  const navNodeId =
    parsed.data.nav_node_id === null
      ? null
      : parsed.data.nav_node_id ?? (CURRENT_NAV_NODE_ID || null);

  const { data, error } = await supabaseAio
    .from("agent_review_lessons")
    .select(
      "id, business_id, nav_node_id, agent_id, queue_item_id, lesson_type, outcome, confidence, title, body, payload, created_at",
    )
    .eq("workspace_id", WORKSPACE_ID)
    .order("created_at", { ascending: false })
    .limit(Math.max(parsed.data.limit * 4, parsed.data.limit));
  if (error) return JSON.stringify({ error: "db_error", message: error.message });

  const rows = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) =>
      !businessId || row.business_id == null || row.business_id === businessId,
    )
    .filter((row) =>
      !navNodeId || row.nav_node_id == null || row.nav_node_id === navNodeId,
    )
    .filter((row) => !parsed.data.agent_id || row.agent_id === parsed.data.agent_id)
    .filter((row) => !parsed.data.outcome || row.outcome === parsed.data.outcome)
    .slice(0, parsed.data.limit);
  return JSON.stringify({ lessons: rows });
}

async function requestHumanReview(args: unknown): Promise<string> {
  const parsed = RequestHumanReviewSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }
  const scope = await resolveReviewScope({
    business_id: parsed.data.business_id,
    nav_node_id: parsed.data.nav_node_id,
  });
  if ("error" in scope) {
    return JSON.stringify({ error: "scope_error", message: scope.error });
  }

  const payload = {
    source: "agent_uncertainty",
    reason: parsed.data.reason,
    proposed_action: parsed.data.proposed_action ?? null,
    risk_level: parsed.data.risk_level,
    confidence: parsed.data.confidence,
    agent_id: CURRENT_AGENT_ID || null,
    run_id: CURRENT_RUN_ID || null,
    context: parsed.data.payload ?? {},
  };
  const meta = [
    `${parsed.data.risk_level} risk`,
    `${Math.round(parsed.data.confidence * 100)}% confidence`,
    parsed.data.reason,
  ]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 500);

  const { data: queueItem, error: queueError } = await supabaseAio
    .from("queue_items")
    .insert({
      workspace_id: WORKSPACE_ID,
      business_id: scope.business_id,
      nav_node_id: scope.nav_node_id,
      agent_id: CURRENT_AGENT_ID || null,
      state: parsed.data.state,
      confidence: parsed.data.confidence,
      title: parsed.data.title,
      meta,
      payload,
    })
    .select("id")
    .single();
  if (queueError || !queueItem) {
    return JSON.stringify({
      error: "db_error",
      message: queueError?.message ?? "queue item insert failed",
    });
  }

  const { data: lesson, error: lessonError } = await supabaseAio
    .from("agent_review_lessons")
    .insert({
      workspace_id: WORKSPACE_ID,
      business_id: scope.business_id,
      nav_node_id: scope.nav_node_id,
      agent_id: CURRENT_AGENT_ID || null,
      run_id: CURRENT_RUN_ID || null,
      queue_item_id: queueItem.id,
      lesson_type: "uncertainty",
      outcome: "pending",
      confidence: parsed.data.confidence,
      title: `Review requested: ${parsed.data.title}`,
      body: parsed.data.proposed_action
        ? `${parsed.data.reason}\n\nProposed action: ${parsed.data.proposed_action}`
        : parsed.data.reason,
      payload,
    })
    .select("id")
    .maybeSingle();
  if (lessonError) {
    console.error("[aio-mcp] agent_review_lessons insert failed", lessonError);
  }

  const { data: workspace } = await supabaseAio
    .from("workspaces")
    .select("slug")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  return JSON.stringify({
    ok: true,
    queue_item_id: queueItem.id,
    lesson_id: lesson?.id ?? null,
    state: parsed.data.state,
    queue_path: workspace?.slug ? `/${workspace.slug}/queue` : null,
  });
}

async function resolveReviewScope(input: {
  business_id?: string;
  nav_node_id?: string | null;
}): Promise<{ business_id: string; nav_node_id: string | null } | { error: string }> {
  let navNodeId = input.nav_node_id ?? (CURRENT_NAV_NODE_ID || null);
  let businessId = input.business_id ?? (CURRENT_BUSINESS_ID || null);

  if (navNodeId) {
    const { data: node, error } = await supabaseAio
      .from("nav_nodes")
      .select("id, business_id")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("id", navNodeId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!node) return { error: "nav_node_id not found in current workspace." };
    const nodeBusinessId = node.business_id as string;
    if (businessId && businessId !== nodeBusinessId) {
      return { error: "nav_node_id belongs to a different business_id." };
    }
    businessId = nodeBusinessId;
  }

  if (businessId) {
    const { data: business, error } = await supabaseAio
      .from("businesses")
      .select("id")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("id", businessId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!business) return { error: "business_id not found in current workspace." };
    return { business_id: businessId, nav_node_id: navNodeId };
  }

  const { data: businesses, error } = await supabaseAio
    .from("businesses")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .is("archived_at", null)
    .limit(2);
  if (error) return { error: error.message };
  if ((businesses ?? []).length === 1) {
    return { business_id: businesses![0]!.id as string, nav_node_id: navNodeId };
  }
  return {
    error:
      "request_human_review needs business_id because this workspace has multiple businesses and the agent is not business-scoped.",
  };
}

async function resolveScheduleScope(input: {
  business_id?: string;
  nav_node_id?: string | null;
}): Promise<{ business_id: string | null; nav_node_id: string | null } | { error: string }> {
  const navNodeId = input.nav_node_id ?? (CURRENT_NAV_NODE_ID || null);
  let businessId = input.business_id ?? (CURRENT_BUSINESS_ID || null);

  if (navNodeId) {
    const { data: node, error } = await supabaseAio
      .from("nav_nodes")
      .select("id, business_id")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("id", navNodeId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!node) return { error: "nav_node_id not found in current workspace." };
    const nodeBusinessId = node.business_id as string;
    if (businessId && businessId !== nodeBusinessId) {
      return { error: "nav_node_id belongs to a different business_id." };
    }
    businessId = nodeBusinessId;
  }

  if (businessId) {
    const { data: biz, error } = await supabaseAio
      .from("businesses")
      .select("id")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("id", businessId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!biz) return { error: "business_id not found in current workspace." };
  }

  return { business_id: businessId, nav_node_id: navNodeId };
}

async function listSchedules(args: unknown): Promise<string> {
  const parsed = ListSchedulesSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const scope = await resolveScheduleScope({
    business_id: parsed.data.business_id,
    nav_node_id: parsed.data.nav_node_id,
  });
  if ("error" in scope) return JSON.stringify({ error: "scope_error", message: scope.error });

  let query = supabaseAio
    .from("schedules_safe")
    .select(
      "id, workspace_id, agent_id, business_id, nav_node_id, kind, cron_expr, provider_routine_id, enabled, last_fired_at, created_at, title, description, instructions, timezone, telegram_target_id, custom_integration_id",
    )
    .eq("workspace_id", WORKSPACE_ID)
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);
  if (scope.nav_node_id) query = query.eq("nav_node_id", scope.nav_node_id);
  else if (scope.business_id) query = query.eq("business_id", scope.business_id);
  if (parsed.data.enabled !== undefined) query = query.eq("enabled", parsed.data.enabled);
  if (parsed.data.kind) query = query.eq("kind", parsed.data.kind);

  const { data, error } = await query;
  if (error) return JSON.stringify({ error: "db_error", message: error.message });
  return JSON.stringify({ schedules: data ?? [], scope });
}

async function createCronScheduleMcp(args: unknown): Promise<string> {
  const parsed = CreateCronScheduleSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const scope = await resolveScheduleScope({
    business_id: parsed.data.business_id,
    nav_node_id: parsed.data.nav_node_id,
  });
  if ("error" in scope) return JSON.stringify({ error: "scope_error", message: scope.error });
  if (!scope.business_id) {
    return JSON.stringify({
      error: "business_required",
      message: "business_id is required unless the MCP session is already scoped to a business/topic.",
    });
  }

  const { data: agent, error: agentErr } = await supabaseAio
    .from("agents")
    .select("id, provider, key_source")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("id", parsed.data.agent_id)
    .maybeSingle();
  if (agentErr) return JSON.stringify({ error: "db_error", message: agentErr.message });
  if (!agent) return JSON.stringify({ error: "not_found", message: "agent_id not found." });

  const useRoutine =
    (agent.provider as string) === "claude" &&
    (agent.key_source as string | null) === "subscription";
  let provider_routine_id: string | null = null;
  let provider_bearer_token: string | null = null;
  if (useRoutine) {
    try {
      const routine = await createRoutine({
        prompt: parsed.data.instructions,
        trigger: { type: "cron", expression: parsed.data.cron_expr },
        postTo: `${APP_ORIGIN}/api/runs/result`,
        allowedTools: ["web_search"],
      });
      provider_routine_id = routine.id;
      provider_bearer_token = routine.bearer_token
        ? Buffer.from(routine.bearer_token, "utf8").toString("base64")
        : null;
    } catch (err) {
      return JSON.stringify({
        error: "routine_create_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const { data, error } = await supabaseAio
    .from("schedules")
    .insert({
      workspace_id: WORKSPACE_ID,
      agent_id: parsed.data.agent_id,
      business_id: scope.business_id,
      nav_node_id: scope.nav_node_id,
      kind: "cron",
      cron_expr: parsed.data.cron_expr,
      title: parsed.data.title ?? null,
      description: parsed.data.description ?? null,
      instructions: parsed.data.instructions,
      timezone: parsed.data.timezone,
      enabled: parsed.data.enabled,
      provider_routine_id,
      provider_bearer_token,
    })
    .select("id, provider_routine_id")
    .single();
  if (error || !data) {
    if (provider_routine_id) await deleteRoutine(provider_routine_id).catch(() => {});
    return JSON.stringify({ error: "db_error", message: error?.message ?? "insert failed" });
  }
  return JSON.stringify({ ok: true, schedule_id: data.id, routine_id: data.provider_routine_id ?? null });
}

async function updateScheduleMcp(args: unknown): Promise<string> {
  const parsed = UpdateScheduleSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const patch: Record<string, unknown> = {};
  const p = parsed.data.patch;
  if (p.agent_id !== undefined) patch.agent_id = p.agent_id;
  if (p.business_id !== undefined) patch.business_id = p.business_id;
  if (p.nav_node_id !== undefined) patch.nav_node_id = p.nav_node_id;
  if (p.cron_expr !== undefined) patch.cron_expr = p.cron_expr;
  if (p.title !== undefined) patch.title = p.title;
  if (p.description !== undefined) patch.description = p.description;
  if (p.instructions !== undefined) patch.instructions = p.instructions;
  if (p.timezone !== undefined) patch.timezone = p.timezone;
  if (p.enabled !== undefined) patch.enabled = p.enabled;
  if (Object.keys(patch).length === 0) return JSON.stringify({ ok: true });

  const { error } = await supabaseAio
    .from("schedules")
    .update(patch)
    .eq("workspace_id", WORKSPACE_ID)
    .eq("id", parsed.data.schedule_id);
  if (error) return JSON.stringify({ error: "db_error", message: error.message });
  return JSON.stringify({ ok: true, schedule_id: parsed.data.schedule_id });
}

async function toggleScheduleMcp(args: unknown): Promise<string> {
  const parsed = ToggleScheduleSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { error } = await supabaseAio
    .from("schedules")
    .update({ enabled: parsed.data.enabled })
    .eq("workspace_id", WORKSPACE_ID)
    .eq("id", parsed.data.schedule_id);
  if (error) return JSON.stringify({ error: "db_error", message: error.message });
  return JSON.stringify({ ok: true, schedule_id: parsed.data.schedule_id, enabled: parsed.data.enabled });
}

async function deleteScheduleMcp(args: unknown): Promise<string> {
  const parsed = DeleteScheduleSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { data: existing } = await supabaseAio
    .from("schedules")
    .select("provider_routine_id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("id", parsed.data.schedule_id)
    .maybeSingle();
  const routineId = (existing?.provider_routine_id as string | null) ?? null;
  if (routineId) await deleteRoutine(routineId).catch(() => {});
  const { error } = await supabaseAio
    .from("schedules")
    .delete()
    .eq("workspace_id", WORKSPACE_ID)
    .eq("id", parsed.data.schedule_id);
  if (error) return JSON.stringify({ error: "db_error", message: error.message });
  return JSON.stringify({ ok: true, schedule_id: parsed.data.schedule_id });
}

async function runScheduleNowMcp(args: unknown): Promise<string> {
  const parsed = RunScheduleNowSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { data: sched, error } = await supabaseAio
    .from("schedules")
    .select("id, workspace_id, agent_id, business_id, nav_node_id, instructions, enabled")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("id", parsed.data.schedule_id)
    .maybeSingle();
  if (error) return JSON.stringify({ error: "db_error", message: error.message });
  if (!sched) return JSON.stringify({ error: "not_found", message: "schedule_id not found." });
  if (sched.enabled === false) {
    return JSON.stringify({ error: "disabled", message: "Schedule is disabled. Enable it first or pass toggle_schedule enabled=true." });
  }
  const prompt =
    parsed.data.prompt?.trim() ||
    ((sched.instructions as string | null | undefined) ?? "").trim() ||
    null;
  const { data: run, error: runErr } = await supabaseAio
    .from("runs")
    .insert({
      workspace_id: WORKSPACE_ID,
      agent_id: sched.agent_id,
      business_id: sched.business_id,
      nav_node_id: sched.nav_node_id,
      schedule_id: sched.id,
      triggered_by: "manual",
      status: "queued",
      input: prompt ? { prompt } : null,
    })
    .select("id")
    .single();
  if (runErr || !run) {
    return JSON.stringify({ error: "db_error", message: runErr?.message ?? "run insert failed" });
  }
  return JSON.stringify({
    ok: true,
    run_id: run.id,
    status: "queued",
    note: "Run row queued. The app dispatcher will pick it up through the normal queue/orphan handling; enable/toggle cron schedules for automatic firing.",
  });
}

function randomSlug(len = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function slugPart(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isLegacyRandomSlug(value: string): boolean {
  return /^[a-z0-9]{16}$/.test(value);
}

async function dashboardSlugBase(input: {
  business_id: string;
  nav_node_id?: string;
  label: string;
}): Promise<string> {
  const [{ data: workspace }, { data: business }] = await Promise.all([
    supabaseAio
      .from("workspaces")
      .select("slug, name")
      .eq("id", WORKSPACE_ID)
      .maybeSingle(),
    supabaseAio
      .from("businesses")
      .select("slug, name")
      .eq("id", input.business_id)
      .eq("workspace_id", WORKSPACE_ID)
      .maybeSingle(),
  ]);

  const parts = [
    slugPart((workspace?.slug as string | null) ?? (workspace?.name as string | null)),
    slugPart((business?.slug as string | null) ?? (business?.name as string | null)),
  ];

  if (input.nav_node_id) {
    const chain = await navNodeSlugChain(input.nav_node_id, input.business_id);
    if (!("error" in chain)) {
      parts.push(...chain.slugs.map((slug) => slugPart(slug)));
    }
  }

  parts.push(slugPart(input.label));
  return parts.filter(Boolean).join("-").slice(0, 110) || `dashboard-${randomSlug(6)}`;
}

async function uniqueDashboardSlug(
  base: string,
  existingId?: string,
): Promise<string> {
  const cleanBase = slugPart(base).slice(0, 110) || `dashboard-${randomSlug(6)}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = attempt === 0 ? cleanBase : `${cleanBase}-${randomSlug(4)}`;
    const { data, error } = await supabaseAio
      .from("agent_dashboards")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return `${cleanBase}-${randomSlug(6)}`;
    if (!data || data.id === existingId) return slug;
  }
  return `${cleanBase}-${randomSlug(8)}`;
}

async function publishDashboard(args: unknown): Promise<string> {
  const parsed = PublishDashboardSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() });
  }
  const { business_id, label } = parsed.data;
  const html_content = aioDashboardShell(parsed.data.html_content);
  const navNodeId = parsed.data.nav_node_id ?? (CURRENT_NAV_NODE_ID || undefined);
  const slugBase = await dashboardSlugBase({ business_id, nav_node_id: navNodeId, label });

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
    const existingSlug = existing.slug as string;
    slug = isLegacyRandomSlug(existingSlug)
      ? await uniqueDashboardSlug(slugBase, existing.id as string)
      : existingSlug;
    const { error } = await supabaseAio
      .from("agent_dashboards")
      .update({ html_content, slug, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return JSON.stringify({ error: "db_error", message: error.message });
  } else {
    slug = await uniqueDashboardSlug(slugBase);
    const { error } = await supabaseAio.from("agent_dashboards").insert({
      workspace_id: WORKSPACE_ID,
      business_id,
      label,
      html_content,
      slug,
    });
    if (error) return JSON.stringify({ error: "db_error", message: error.message });
  }

  const url = normalizeCustomTabUrl(`${APP_ORIGIN}/d/${slug}`);

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
  const normalizedUrl = normalizeCustomTabUrl(url);
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
      .update({ url: normalizedUrl, sort_order, nav_node_id: nav_node_id ?? null })
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
      url: normalizedUrl,
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

async function proposeImprovement(args: unknown): Promise<string> {
  const parsed = ProposeImprovementSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({
      error: "validation_failed",
      details: parsed.error.flatten(),
    });
  }

  const shouldResolveScope =
    Boolean(parsed.data.business_id) ||
    parsed.data.nav_node_id !== undefined ||
    Boolean(CURRENT_BUSINESS_ID) ||
    Boolean(CURRENT_NAV_NODE_ID);
  const scope = shouldResolveScope
    ? await resolveOperatingScope({
        business_id: parsed.data.business_id,
        nav_node_id: parsed.data.nav_node_id,
      })
    : null;
  if (scope && "error" in scope) {
    return JSON.stringify({ error: "scope_error", message: scope.error });
  }

  const title = parsed.data.title.trim();
  const sections = [
    parsed.data.description.trim(),
    parsed.data.expected_impact
      ? `Expected impact:\n${parsed.data.expected_impact.trim()}`
      : "",
    parsed.data.evidence ? `Evidence:\n${parsed.data.evidence.trim()}` : "",
    scope
      ? `Scope:\nbusiness_id=${scope.business_id}${
          scope.nav_node_id ? `\nnav_node_id=${scope.nav_node_id}` : ""
        }`
      : "",
  ].filter(Boolean);

  const { data: existing, error: existingError } = await supabaseAio
    .from("improvements")
    .select("id, status")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("title", title)
    .in("status", ["proposed", "approved"])
    .maybeSingle();
  if (existingError) {
    return JSON.stringify({ error: "db_error", message: existingError.message });
  }
  if (existing) {
    return JSON.stringify({
      ok: true,
      improvement_id: existing.id,
      status: existing.status,
      duplicate: true,
    });
  }

  const { data, error } = await supabaseAio
    .from("improvements")
    .insert({
      workspace_id: WORKSPACE_ID,
      title,
      description: sections.join("\n\n"),
      status: "proposed",
    })
    .select("id")
    .single();
  if (error || !data) {
    return JSON.stringify({
      error: "db_error",
      message: error?.message ?? "improvement insert failed",
    });
  }

  const { data: workspace } = await supabaseAio
    .from("workspaces")
    .select("slug")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  return JSON.stringify({
    ok: true,
    improvement_id: data.id,
    status: "proposed",
    path: workspace?.slug ? `/${workspace.slug}/self-improving` : null,
  });
}

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
      name: "get_business_operating_snapshot",
      description:
        "Get the closed-loop operating snapshot for a business/topic: business context, active targets, KPI periods, agents, schedules, recent runs, and open review queue. Use this at the start of business/topic main-loop runs.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description:
              "Optional business UUID. Defaults to the current MCP business scope when available.",
          },
          nav_node_id: {
            type: ["string", "null"],
            format: "uuid",
            description:
              "Optional topic/nav-node UUID. Omit to use the current topic scope; pass null for whole-business view.",
          },
          recent_runs_limit: {
            type: "number",
            default: 12,
            minimum: 1,
            maximum: 50,
          },
        },
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
        "Sla een AIO-styled HTML-dashboard op en pin het als tab in de BusinessTabs-nav van de business. " +
        "Geeft {url, tab_id, slug} terug. Zelfde label = update HTML in-place (stabiele URL). " +
        "Gebruik voor rijke visuele samenvattingen, statistieken, KPI-overzichten. " +
        "Voor topic-dashboards MOET nav_node_id mee zodat de tab in de topic-shell verschijnt. " +
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
              "HTML-fragment heeft voorkeur: <main class=\"aio-dashboard\">...</main> met optioneel scoped <style>. " +
              "Een volledige HTML-pagina mag ook, maar de inhoud wordt alsnog in AIO-dashboard styling gewrapt. " +
              "Geen externe iframes. Gebruik AIO CSS variables en body[data-theme] voor light/dark compatibility.",
          },
        },
        required: ["business_id", "label", "html_content"],
        additionalProperties: false,
      },
    },
    {
      name: "publish_topic_dashboard",
      description:
        "Maak of update een AIO-styled HTML-dashboard voor een topic in een business, zonder UUIDs nodig te hebben. Voorbeeld: business='TrompTechDesigns', topic='outreach'. Het dashboard wordt opgeslagen, als tab in de bestaande topic-shell gekoppeld en daarnaast als publiek /d/<slug> dashboard beschikbaar gemaakt. " +
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
              "HTML-fragment heeft voorkeur: <main class=\"aio-dashboard\">...</main> met optioneel scoped <style>. Mag inline CSS en vanilla JS bevatten. Gebruik AIO CSS variables en body[data-theme] voor light/dark compatibility.",
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
        "Recent agent runs. Useful for diagnosing failures or summarising activity. Defaults to the current MCP business/topic scope when available; pass nav_node_id=null to read all runs in the selected business.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description: "Filter to a specific business id.",
          },
          nav_node_id: {
            type: ["string", "null"],
            format: "uuid",
            description:
              "Filter to a specific topic/nav-node. Omit to use the current topic scope; pass null to disable topic filtering.",
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
    {
      name: "list_review_learnings",
      description:
        "List recent HITL review lessons: why agents escalated, what operators approved/rejected, and what future agents should remember before similar decisions.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description:
              "Optional business UUID. Defaults to the current MCP business scope.",
          },
          nav_node_id: {
            type: ["string", "null"],
            format: "uuid",
            description:
              "Optional topic/nav-node UUID. Defaults to the current MCP topic scope; pass null to disable topic filtering.",
          },
          agent_id: { type: "string", format: "uuid" },
          outcome: {
            type: "string",
            enum: ["pending", "approved", "rejected", "resolved", "noted"],
          },
          limit: { type: "number", default: 10, minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "request_human_review",
      description:
        "Create a persistent HITL queue item when the agent is uncertain, low-confidence, blocked, or about to take a risky/irreversible/brand/legal/financial action. Safe escalation: does not perform the action and records a learning note.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: {
            type: "string",
            format: "uuid",
            description:
              "Business UUID. Defaults to the current MCP business scope; required for workspace-global agents unless a single business can be inferred.",
          },
          nav_node_id: {
            type: ["string", "null"],
            format: "uuid",
            description: "Optional topic/nav-node UUID.",
          },
          title: { type: "string", minLength: 3, maxLength: 160 },
          reason: { type: "string", minLength: 3, maxLength: 2000 },
          proposed_action: { type: "string", maxLength: 2000 },
          risk_level: {
            type: "string",
            enum: ["low", "medium", "high"],
            default: "medium",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            default: 0.5,
          },
          state: {
            type: "string",
            enum: ["review", "fail"],
            default: "review",
          },
          payload: { type: "object" },
        },
        required: ["title", "reason"],
        additionalProperties: false,
      },
    },
    {
      name: "list_schedules",
      description:
        "List cron/webhook/manual schedules in the current workspace. Defaults to the current MCP business/topic scope when available; pass business_id or nav_node_id to be explicit.",
      inputSchema: {
        type: "object",
        properties: {
          business_id: { type: "string", format: "uuid" },
          nav_node_id: { type: "string", format: "uuid" },
          enabled: { type: "boolean" },
          kind: { type: "string", enum: ["cron", "webhook", "manual"] },
          limit: { type: "number", default: 50, minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "create_cron_schedule",
      description:
        "Create a business/topic-scoped cron schedule for an agent. Uses the current business/topic scope by default; for subscription-Claude agents it creates an Anthropic Routine, otherwise local AIO cron picks it up.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", format: "uuid" },
          business_id: { type: "string", format: "uuid" },
          nav_node_id: { type: "string", format: "uuid" },
          cron_expr: { type: "string", description: "5-field cron expression, e.g. */15 * * * * or 0 9 * * 1-5." },
          title: { type: "string", maxLength: 120 },
          description: { type: "string", maxLength: 500 },
          instructions: { type: "string", description: "Prompt/instructions used when the cron fires." },
          timezone: { type: "string", default: "Europe/Amsterdam" },
          enabled: { type: "boolean", default: true },
        },
        required: ["agent_id", "cron_expr", "instructions"],
        additionalProperties: false,
      },
    },
    {
      name: "update_schedule",
      description:
        "Edit an existing schedule's title, instructions, cron expression, agent, business/topic pin, timezone, or enabled state.",
      inputSchema: {
        type: "object",
        properties: {
          schedule_id: { type: "string", format: "uuid" },
          patch: {
            type: "object",
            properties: {
              agent_id: { type: "string", format: "uuid" },
              business_id: { type: "string", format: "uuid" },
              nav_node_id: { type: "string", format: "uuid" },
              cron_expr: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              instructions: { type: "string" },
              timezone: { type: "string" },
              enabled: { type: "boolean" },
            },
            additionalProperties: false,
          },
        },
        required: ["schedule_id", "patch"],
        additionalProperties: false,
      },
    },
    {
      name: "toggle_schedule",
      description: "Start/stop a schedule by setting enabled=true or enabled=false.",
      inputSchema: {
        type: "object",
        properties: {
          schedule_id: { type: "string", format: "uuid" },
          enabled: { type: "boolean" },
        },
        required: ["schedule_id", "enabled"],
        additionalProperties: false,
      },
    },
    {
      name: "delete_schedule",
      description:
        "Delete a schedule. If it has an Anthropic provider routine, the routine is deleted too.",
      inputSchema: {
        type: "object",
        properties: { schedule_id: { type: "string", format: "uuid" } },
        required: ["schedule_id"],
        additionalProperties: false,
      },
    },
    {
      name: "run_schedule_now",
      description:
        "Queue one immediate manual run using a schedule's stored instructions. Use toggle_schedule for starting/stopping recurring cron execution.",
      inputSchema: {
        type: "object",
        properties: {
          schedule_id: { type: "string", format: "uuid" },
          prompt: { type: "string", description: "Optional override prompt for this one run." },
        },
        required: ["schedule_id"],
        additionalProperties: false,
      },
    },
    {
      name: "propose_improvement",
      description:
        "Create a safe self-improvement proposal for the operator to approve later. Use this for new agents, skills, integrations, strategy changes, or risky automation changes instead of silently mutating the system.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 160 },
          description: { type: "string", maxLength: 4000 },
          business_id: {
            type: "string",
            format: "uuid",
            description:
              "Optional business UUID. Defaults to current MCP business scope when available.",
          },
          nav_node_id: {
            type: ["string", "null"],
            format: "uuid",
            description:
              "Optional topic/nav-node UUID. Omit for current topic; pass null for business/workspace level.",
          },
          expected_impact: { type: "string", maxLength: 1000 },
          evidence: { type: "string", maxLength: 2000 },
        },
        required: ["title", "description"],
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
    case "get_business_operating_snapshot":
      result = await getBusinessOperatingSnapshot(args);
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
    case "list_review_learnings":
      result = await listReviewLearnings(args);
      break;
    case "request_human_review":
      result = await requestHumanReview(args);
      break;
    case "list_schedules":
      result = await listSchedules(args);
      break;
    case "create_cron_schedule":
      result = await createCronScheduleMcp(args);
      break;
    case "update_schedule":
      result = await updateScheduleMcp(args);
      break;
    case "toggle_schedule":
      result = await toggleScheduleMcp(args);
      break;
    case "delete_schedule":
      result = await deleteScheduleMcp(args);
      break;
    case "run_schedule_now":
      result = await runScheduleNowMcp(args);
      break;
    case "propose_improvement":
      result = await proposeImprovement(args);
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
