// AIO Control MCP server — exposes core read tools as MCP tools.
// Runs as a standalone stdio subprocess spawned by McpHost.
//
// Tools: list_businesses, list_agents, read_secret, list_runs
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
    {
      name: "read_secret",
      description:
        "Read a workspace secret by its uppercase name (e.g. AIRTABLE_API_KEY). Returns { value: string|null }.",
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
      result = await readSecret(args);
      break;
    case "list_runs":
      result = await listRuns(args);
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
