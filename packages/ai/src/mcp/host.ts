// Native MCP host for AIO Control. Spawns MCP servers as subprocesses
// and talks the official MCP JSON-RPC protocol to them via the
// @modelcontextprotocol/sdk Client. Lets non-Claude providers (notably
// MiniMax over the Coder Plan) call MCP tools without routing through
// claude-cli — i.e. without needing an Anthropic auth at all.
//
// Used by streamMinimax when the agent's config.mcpServers is set:
//   1. spawn each server, list its tools
//   2. expose them to MiniMax as OpenAI-style function tools
//   3. when MiniMax emits tool_calls, dispatch via callTool here
//   4. feed results back, loop until done
//
// Known servers ship with sane defaults so the user only types the
// short id ("minimax") in agent config; the corresponding command +
// args + env are baked in here. Add more entries as we onboard them.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type McpToolDef = {
  /** Server-namespaced name to avoid collisions ("minimax__web_search"). */
  name: string;
  /** Original tool name as the server reported it. */
  raw_name: string;
  /** Which server hosts this tool — used to route callTool back. */
  server: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** Per-server scope rules. The agent dialog stores these as
 *  agent.config.mcpPermissions; the host honours them when listing
 *  tools (e.g. drops write tools when filesystem is "ro").
 */
export type McpPermissions = {
  /** off | ro | rw — default rw when omitted. */
  filesystem?: "off" | "ro" | "rw";
  /** off | ro | rw — default rw when omitted. */
  aio?: "off" | "ro" | "rw";
};

// Tool-name patterns that should be dropped when a server is in
// read-only mode. Filesystem servers (the Anthropic reference and most
// community ones) follow this naming.
const WRITE_TOOL_PATTERNS = [
  /^write[-_]/i,
  /^edit[-_]/i,
  /^create[-_]/i,
  /^delete[-_]/i,
  /^remove[-_]/i,
  /^move[-_]/i,
  /^rename[-_]/i,
  /[-_]write$/i,
  /[-_]edit$/i,
];

type ServerSpec = {
  command: string;
  args: string[];
  /** Extra env to overlay on top of process.env when spawning. */
  env?: () => Record<string, string>;
};

const SERVER_REGISTRY: Record<string, ServerSpec> = {
  // MiniMax Coder-Plan MCP — exposes web_search + understand_image
  // backed by MiniMax's own search/vision endpoints. Note: the npm
  // package is published WITHOUT the @minimax-ai/ scope.
  minimax: {
    command: "npx",
    args: ["-y", "minimax-coding-plan-mcp"],
    env: () => ({
      ...(process.env.MINIMAX_API_KEY
        ? { MINIMAX_API_KEY: process.env.MINIMAX_API_KEY }
        : {}),
      // Default to the global region; override with MINIMAX_API_HOST
      // when the user is on the mainland-China endpoint.
      MINIMAX_API_HOST:
        process.env.MINIMAX_API_HOST ?? "https://api.minimax.io",
    }),
  },
  // Filesystem read/write/list — same toolset Claude Code's Read/Write
  // tools provide, but as a standalone MCP server. Sandboxed to
  // MCP_FS_ROOT (default /home/jeremy/aio-control so the agent can
  // read project files but not random /etc paths).
  filesystem: {
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-filesystem",
      process.env.MCP_FS_ROOT ?? "/home/jeremy/aio-control",
    ],
  },
  // Generic web fetcher — pulls a URL and returns the body. Equivalent
  // to Claude Code's WebFetch but as a portable MCP server.
  fetch: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
  },
  // AIO Control platform tools (list_businesses, read_secret, list_agents,
  // list_runs). Spawns as a local TypeScript subprocess via tsx.
  // Credentials come via env — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  // are forwarded by McpHost.connect() via envOverrides.
  // Workspace is scoped by AIO_WORKSPACE_ID env var (set at the agent/
  // workspace level in aio-control).
  aio: {
    command: "npx",
    args: [
      "-y",
      "tsx",
      "/home/jeremy/mcp-servers/aio-server.ts",
    ],
    env: () => ({
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      AIO_WORKSPACE_ID: process.env.AIO_WORKSPACE_ID ?? "default",
    }),
  },
  // Bash shell access — executes commands locally on the VPS.
  // Dangerous commands (rm -rf, shutdown, dd, etc.) are blocked
  // unless prefixed with "Approved: " (user approved via ask_followup).
  bash: {
    command: "npx",
    args: [
      "-y",
      "tsx",
      "/home/jeremy/mcp-servers/bash-server.ts",
    ],
  },
};

type Connected = {
  server: string;
  client: Client;
  tools: McpToolDef[];
};

export class McpHost {
  private connected: Connected[] = [];

  /** Spawn + handshake every requested server in parallel and cache
   *  their tool lists. Throws when a known server fails to start so
   *  the caller can surface a real error instead of silently dropping
   *  the tools. Unknown server ids are skipped with a warning.
   *
   *  `envOverrides` lets the caller force-set vars the MCP child needs
   *  even when the worker process running this code was forked with
   *  a stripped env (Next.js standalone occasionally does that). The
   *  most common case: passing the resolved MINIMAX_API_KEY from the
   *  workspace's tiered API-key store, since the MiniMax MCP rejects
   *  with "MINIMAX_API_KEY env or header cannot be empty" otherwise. */
  async connect(
    serverIds: string[],
    envOverrides?: Record<string, string>,
    permissions: McpPermissions = {},
  ): Promise<void> {
    const tasks: Promise<Connected | null>[] = [];
    for (const id of serverIds) {
      const spec = SERVER_REGISTRY[id];
      if (!spec) {
        console.warn(`[mcp] unknown server id: ${id} — skipping`);
        continue;
      }
      // Skip a server entirely when the user set its scope to "off"
      // — we honour the agent-level permission gate before spawning.
      if (id === "filesystem" && permissions.filesystem === "off") continue;
      if (id === "aio" && permissions.aio === "off") continue;
      tasks.push(
        this.connectOne(id, spec, envOverrides ?? {}, permissions),
      );
    }
    const results = await Promise.all(tasks);
    for (const r of results) {
      if (r) this.connected.push(r);
    }
  }

  private async connectOne(
    id: string,
    spec: ServerSpec,
    envOverrides: Record<string, string>,
    permissions: McpPermissions,
  ): Promise<Connected> {
    // Strip undefined values from process.env before spreading (some
    // Node versions throw when a spawn env contains undefined values).
    const cleanProcessEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") cleanProcessEnv[k] = v;
    }
    const transport = new StdioClientTransport({
      command: spec.command,
      args: spec.args,
      env: {
        ...cleanProcessEnv,
        ...(spec.env?.() ?? {}),
        ...envOverrides,
      },
      stderr: "pipe",
    });
    const client = new Client(
      { name: "aio-control", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    const list = await client.listTools();
    const fsScope = permissions.filesystem ?? "rw";
    const tools: McpToolDef[] = list.tools
      .filter((t) => {
        // Filesystem read-only mode: drop any tool whose name matches
        // write/edit/delete/move patterns. Server keeps running so
        // read tools (read_file, list_directory, …) stay available.
        if (id === "filesystem" && fsScope === "ro") {
          return !WRITE_TOOL_PATTERNS.some((re) => re.test(t.name));
        }
        return true;
      })
      .map((t) => ({
        name: `${id}__${t.name}`,
        raw_name: t.name,
        server: id,
        description: t.description ?? "",
        parameters: (t.inputSchema as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      }));
    return { server: id, client, tools };
  }

  /** Flat list of all tools across every connected server, with names
   *  prefixed so the LLM sees server boundaries. */
  tools(): McpToolDef[] {
    return this.connected.flatMap((c) => c.tools);
  }

  /** Dispatch a tool call by its prefixed name back to the right
   *  server. Returns the tool's content as a string for feeding into
   *  the chat loop. */
  async call(prefixedName: string, args: unknown): Promise<string> {
    const idx = prefixedName.indexOf("__");
    const server = idx > 0 ? prefixedName.slice(0, idx) : "";
    const raw = idx > 0 ? prefixedName.slice(idx + 2) : prefixedName;
    const conn = this.connected.find((c) => c.server === server);
    if (!conn) {
      return JSON.stringify({
        error: `MCP server '${server}' niet verbonden`,
      });
    }
    try {
      const res = await conn.client.callTool({
        name: raw,
        arguments: (args as Record<string, unknown>) ?? {},
      });
      // CallToolResult.content is an array of content blocks. We
      // flatten text blocks; non-text blocks (images, resources) get
      // serialized as JSON so the LLM at least sees their type.
      const blocks = (res.content as Array<Record<string, unknown>>) ?? [];
      const parts: string[] = [];
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string") {
          parts.push(b.text);
        } else {
          parts.push(JSON.stringify(b));
        }
      }
      return parts.join("\n") || "(empty result)";
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  /** Tear down every connected server. Safe to call after partial
   *  connect failure. */
  async close(): Promise<void> {
    await Promise.all(
      this.connected.map(async (c) => {
        try {
          await c.client.close();
        } catch {
          /* ignore */
        }
      }),
    );
    this.connected = [];
  }
}
