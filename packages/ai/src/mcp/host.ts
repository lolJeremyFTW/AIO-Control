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

// npm global bin dir on the VPS — set NPM_GLOBAL_BIN env var to
// override. All MCP server packages are pre-installed here so we
// bypass npx's npm-registry lookup (which takes 30+ s on every run).
const NPM_GLOBAL_BIN =
  process.env.NPM_GLOBAL_BIN ??
  `${process.env.HOME ?? "/home/jeremy"}/.npm-global/bin`;

// Local TypeScript MCP servers — resolved relative to this project.
const AIO_SRC = "/home/jeremy/aio-control/packages/ai/src/mcp/servers";

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
    command: `${NPM_GLOBAL_BIN}/minimax-coding-plan-mcp`,
    args: [],
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
  // MCP_FS_ROOT (default /home/jeremy so agents can reach all project
  // dirs under the user home without re-configuring the env var).
  filesystem: {
    command: `${NPM_GLOBAL_BIN}/mcp-server-filesystem`,
    args: [process.env.MCP_FS_ROOT ?? "/home/jeremy"],
  },
  // AIO Control platform tools (list_businesses, list_agents, list_runs).
  // read_secret is gated by AIO_MCP_ALLOW_READ_SECRET in aio-server.
  // Credentials come via env — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  // are forwarded by McpHost.connect() via envOverrides.
  // Workspace is scoped by AIO_WORKSPACE_ID env var (set at the agent/
  // workspace level in aio-control).
  aio: {
    command: `${NPM_GLOBAL_BIN}/tsx`,
    args: [`${AIO_SRC}/aio-server.ts`],
    env: () => ({
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      AIO_WORKSPACE_ID: process.env.AIO_WORKSPACE_ID ?? "default",
      // Master key for pgcrypto symmetric decrypt — needed by the
      // send_telegram_message tool to resolve the Telegram bot token
      // through the resolve_api_key RPC.
      AGENT_SECRET_KEY: process.env.AGENT_SECRET_KEY ?? "",
      NEXT_PUBLIC_TRIGGER_ORIGIN: process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? "",
      ...(process.env.AIO_MCP_ALLOW_READ_SECRET
        ? { AIO_MCP_ALLOW_READ_SECRET: process.env.AIO_MCP_ALLOW_READ_SECRET }
        : {}),
    }),
  },
  // Bash shell access — executes commands locally on the VPS.
  // execute_code and cli_tool are exposed as aliases alongside bash so
  // agents that reference those names in their system prompts work correctly.
  bash: {
    command: `${NPM_GLOBAL_BIN}/tsx`,
    args: [`${AIO_SRC}/bash-server.ts`],
  },
  // Local fetch MCP — retrieves arbitrary URLs and returns the body as
  // text (HTML is stripped to plain text). Built-in local server so it
  // starts instantly without any npm download.
  fetch: {
    command: `${NPM_GLOBAL_BIN}/tsx`,
    args: [`${AIO_SRC}/fetch-server.ts`],
  },
  // Microsoft Playwright MCP — full Chromium browser with JS rendering.
  // Models are natively trained on Playwright tool signatures. Headless
  // mode so it works on a headless VPS without a display server.
  // PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH points to the already-installed
  // playwright chromium bundle so the MCP server doesn't need to download
  // chrome-for-testing (a separate 175 MB download).
  playwright: {
    command: `${NPM_GLOBAL_BIN}/playwright-mcp`,
    args: ["--headless", "--browser", "chromium"],
    env: () => ({
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        `${process.env.HOME ?? "/home/jeremy"}/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`,
    }),
  },
  // Brave Search MCP — high-quality web + news search backed by the
  // Brave Search API. Needs BRAVE_API_KEY set in workspace secrets.
  brave: {
    command: `${NPM_GLOBAL_BIN}/mcp-server-brave-search`,
    args: [],
    env: () => ({
      ...(process.env.BRAVE_API_KEY
        ? { BRAVE_API_KEY: process.env.BRAVE_API_KEY }
        : {}),
    }),
  },
  // Memory MCP — persistent knowledge graph (entities + relations +
  // observations). Agents can store facts between runs and retrieve
  // them semantically. Stored in a local SQLite file on the VPS.
  memory: {
    command: `${NPM_GLOBAL_BIN}/mcp-server-memory`,
    args: [],
    env: () => ({
      MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH ?? "/home/jeremy/.aio-memory.json",
    }),
  },
  // Firecrawl MCP — crawl websites and extract structured data.
  // Supports single-page scrape, full-site crawl, and deep research
  // modes. Needs FIRECRAWL_API_KEY set in workspace secrets.
  firecrawl: {
    command: `${NPM_GLOBAL_BIN}/firecrawl-mcp`,
    args: [],
    env: () => ({
      // Self-hosted Firecrawl instance running on port 3002.
      // Falls back to cloud API if FIRECRAWL_API_URL is not set.
      FIRECRAWL_API_URL:
        process.env.FIRECRAWL_API_URL ?? "http://localhost:3002",
      ...(process.env.FIRECRAWL_API_KEY
        ? { FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY }
        : {}),
    }),
  },
};

type Connected = {
  server: string;
  client: Client;
  tools: McpToolDef[];
  /** PID of the spawned subprocess — stored immediately after spawn so we
   *  can SIGKILL it in close() even if the MCP SDK property was mangled by
   *  the bundler. Also used to kill timed-out servers that leaked. */
  pid: number | undefined;
};

export class McpHost {
  private connected: Connected[] = [];

  /** Spawn + handshake every requested server in parallel and cache
   *  their tool lists. Individual server failures are non-fatal: the
   *  failed server is skipped with a warning so the agent keeps working
   *  with the servers that did start. Only completely unknown ids are
   *  silently skipped.
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
      // Wrap each connectOne with a 30 s timeout so a slow server (e.g.
      // playwright launching Chromium) can't block the entire connect()
      // via Promise.all and leave the agent with zero tools.
      //
      // IMPORTANT: when the timeout fires, connectOne keeps running in
      // the background and its child process becomes an orphan. We track
      // the PID via a shared variable so the timeout handler can SIGKILL
      // it before giving up.
      const CONNECT_TIMEOUT_MS = 30_000;
      let spawnedPid: number | undefined;
      const setPid = (pid: number) => { spawnedPid = pid; };
      const timeoutRace = new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn(`[mcp] server '${id}' timed out after ${CONNECT_TIMEOUT_MS}ms — skipping`);
          if (spawnedPid) {
            try { process.kill(spawnedPid, "SIGKILL"); } catch { /* ignore */ }
          }
          resolve(null);
        }, CONNECT_TIMEOUT_MS),
      );
      tasks.push(
        Promise.race([
          this.connectOne(id, spec, envOverrides ?? {}, permissions, setPid).catch(
            (err) => {
              console.warn(
                `[mcp] server '${id}' failed to start — skipping (${err instanceof Error ? err.message : err})`,
              );
              return null as null;
            },
          ),
          timeoutRace,
        ]),
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
    /** Called as soon as the child process is spawned with its PID so the
     *  caller can kill it if the 30 s timeout fires first. */
    onSpawn?: (pid: number) => void,
  ): Promise<Connected> {
    // Strip undefined values from process.env before spreading (some
    // Node versions throw when a spawn env contains undefined values).
    const cleanProcessEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") cleanProcessEnv[k] = v;
    }
    const fullEnv = {
      ...cleanProcessEnv,
      ...(spec.env?.() ?? {}),
      ...envOverrides,
    };
    console.log(`[mcp] connectOne spawning: ${spec.command} ${spec.args.join(" ")}`);
    const transport = new StdioClientTransport({
      command: spec.command,
      args: spec.args,
      env: fullEnv,
      stderr: "pipe",
    });

    // --- PID capture strategy -------------------------------------------
    // We need the child PID BEFORE the 30 s timeout so we can kill it if
    // the MCP handshake hangs. The transport spawns the process internally
    // when client.connect() calls transport.start(). We patch start() to
    // read the PID immediately after spawn — works even if the bundler
    // renamed the private _process field, because we check right at the
    // moment the process is freshly set.
    let childPid: number | undefined;
    const tryCapturePid = () => {
      if (childPid) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = transport as any;
      const proc = t._process ?? t.process ?? t._subprocess;
      if (proc?.pid) {
        childPid = proc.pid as number;
        onSpawn?.(childPid);
        console.log(`[mcp][${id}] spawned pid=${childPid}`);
      }
    };
    // Patch transport.start() — called by client.connect() internally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origStart: () => Promise<void> = (transport as any).start.bind(transport);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (transport as any).start = async function patchedStart() {
      await origStart();
      tryCapturePid(); // process is now set
    };
    // -----------------------------------------------------------------------

    let stderrChunks: Buffer[] = [];
    transport.stderr?.on("data", (chunk: Buffer) => {
      // Stderr fires once the child starts — another PID capture opportunity
      // for servers that write startup messages (filesystem, memory, etc.).
      tryCapturePid();
      stderrChunks.push(chunk);
      process.stderr.write(`[mcp][${id}] stderr: ${chunk.toString()}`);
    });
    transport.stderr?.on("close", () => {
      const stderrText = Buffer.concat(stderrChunks).toString();
      if (stderrText) console.log(`[mcp][${id}] stderr closed: ${stderrText}`);
    });
    const client = new Client(
      { name: "aio-control", version: "1.0.0" },
      { capabilities: {} },
    );
    try {
      await client.connect(transport);
    } catch (connErr) {
      const stderrText = Buffer.concat(stderrChunks).toString();
      console.error(`[mcp][${id}] connect failed: ${connErr instanceof Error ? connErr.message : connErr}`);
      console.error(`[mcp][${id}] stderr collected: ${stderrText}`);
      throw connErr;
    }
    const list = await client.listTools().catch((listErr: unknown) => {
      const stderrText = Buffer.concat(stderrChunks).toString();
      console.error(`[mcp][${id}] listTools failed: ${listErr instanceof Error ? listErr.message : listErr}`);
      console.error(`[mcp][${id}] stderr at listTools: ${stderrText}`);
      throw listErr;
    });
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
    return { server: id, client, pid: childPid, tools };
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
    // 60 s hard cap per tool call — prevents a hanging filesystem glob or
    // slow browser action from orphaning the entire server connection.
    const CALL_TIMEOUT_MS = 60_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`tool call timed out after ${CALL_TIMEOUT_MS}ms`)), CALL_TIMEOUT_MS),
    );
    try {
      const res = await Promise.race([
        conn.client.callTool({
          name: raw,
          arguments: (args as Record<string, unknown>) ?? {},
        }),
        timeoutPromise,
      ]);
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
   *  connect failure. Graceful SDK close first, then SIGKILL via stored PID
   *  as a backstop — the SDK only closes stdio pipes which some servers
   *  (e.g. filesystem, memory) don't treat as an exit signal, leading to
   *  hundreds of orphaned node processes that OOM the VPS. */
  async close(): Promise<void> {
    await Promise.all(
      this.connected.map(async (c) => {
        try {
          await c.client.close();
        } catch {
          /* ignore */
        }
        // Kill the child by PID — the PID was captured at spawn time so it
        // is bundler-safe (no reliance on mangled private properties).
        if (c.pid) {
          try {
            process.kill(c.pid, "SIGTERM");
            // Give it 2 s to die gracefully, then SIGKILL.
            await new Promise<void>((resolve) => {
              const t = setTimeout(() => {
                try { process.kill(c.pid!, "SIGKILL"); } catch { /* already gone */ }
                resolve();
              }, 2000);
              // Poll until the process is gone (no ChildProcess reference to
              // attach an "exit" listener, so we check via kill(0)).
              const check = setInterval(() => {
                try { process.kill(c.pid!, 0); } catch {
                  clearInterval(check);
                  clearTimeout(t);
                  resolve();
                }
              }, 100);
            });
          } catch {
            /* ignore — process already gone */
          }
        }
      }),
    );
    this.connected = [];
  }
}
