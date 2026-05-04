// MiniMax MCP-via-Claude subprocess relay.
//
// MiniMax's Coder Plan exposes its tools (web_search, understand_image)
// only via an MCP server, not over a normal HTTP API. To use those tools
// programmatically we host MiniMax MCP inside a Claude Code subprocess —
// Claude becomes the MCP host, runs the prompt, calls MiniMax tools, and
// streams the result back over stdout in stream-json format.
//
// Trigger this provider by setting agent.config.mcpServers = ["minimax"]
// (or a richer object — see MCP_SERVERS below). If `claude` CLI isn't on
// PATH we fall through with a clear error event.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";
import { resolveCliBin } from "./cli-bin";

// Known MCP servers we can spawn inside the Claude subprocess. Add more
// here as we onboard them; agents reference them by name.
const MCP_SERVERS: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {
  minimax: {
    command: "npx",
    args: ["-y", "@minimax-ai/coding-plan-mcp"],
    env: {
      // The MCP server reads MINIMAX_API_KEY from env.
      ...(process.env.MINIMAX_API_KEY ? { MINIMAX_API_KEY: process.env.MINIMAX_API_KEY } : {}),
    },
  },
};

export async function* streamMinimaxViaClaude(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const messageId = randomUUID();

  const requested = opts.config.mcpServers ?? ["minimax"];
  const enabled = requested.filter((name) => MCP_SERVERS[name]);
  if (enabled.length === 0) {
    yield {
      type: "error",
      code: "no_mcp",
      message: "Geen bekende MCP-servers in config.mcpServers (probeer 'minimax').",
    };
    return;
  }

  // Build the ephemeral MCP config the Claude CLI consumes.
  const mcpConfig = {
    mcpServers: Object.fromEntries(
      enabled.map((name) => [name, MCP_SERVERS[name]] as const),
    ),
  };
  const dir = await mkdtemp(join(tmpdir(), "aio-mcp-"));
  const cfgPath = join(dir, "mcp.json");
  await writeFile(cfgPath, JSON.stringify(mcpConfig));

  // The Claude CLI reads its prompt from stdin in --print mode. We pipe
  // the conversation in as a single user message — the system prompt
  // goes via --append-system-prompt.
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";

  yield { type: "message_start", message_id: messageId, role: "assistant" };

  // resolveCliBin walks ~/.npm-global, /opt/homebrew, /usr/local, /usr,
  // /snap so a default Linux/Mac install of Claude Code is found
  // automatically. Operators can still pin the absolute path via
  // CLAUDE_BIN.
  const claudeBin = resolveCliBin("claude", "CLAUDE_BIN");
  const child = spawn(
    claudeBin,
    [
      "--print",
      "--output-format",
      "stream-json",
      "--mcp-config",
      cfgPath,
      ...(opts.config.systemPrompt
        ? ["--append-system-prompt", opts.config.systemPrompt]
        : []),
      ...(opts.config.model ? ["--model", opts.config.model] : []),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  child.stdin.write(prompt);
  child.stdin.end();

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  // Convert child errors (claude not installed, etc.) into a single
  // AGUIEvent the consumer can render.
  const earlyErr = await new Promise<Error | null>((resolve) => {
    child.once("error", (err) => resolve(err));
    // Resolve to null on the next microtask — if we get here without an
    // error, normal stdout streaming takes over.
    setTimeout(() => resolve(null), 50);
  });
  if (earlyErr) {
    yield {
      type: "error",
      code: "claude_cli_missing",
      message:
        `Kon '${claudeBin}' niet starten (${earlyErr.message}). ` +
        `Installeer Claude Code op de host, of zet CLAUDE_BIN in env naar ` +
        `het absolute pad (bijv. /home/jeremy/.npm-global/bin/claude).`,
    };
    return;
  }

  // stream-json: one JSON object per line. We translate the subset we
  // care about (text deltas, tool calls/results) into AG-UI events.
  let buf = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const it = child.stdout[Symbol.asyncIterator]();
  while (true) {
    const { value, done } = await it.next();
    if (done) break;
    buf += (value as Buffer).toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as Record<string, unknown>;
        const type = evt.type as string | undefined;
        if (type === "assistant" && typeof evt.text === "string") {
          yield { type: "token", message_id: messageId, delta: evt.text };
        } else if (type === "tool_use") {
          yield {
            type: "tool_call_start",
            tool_call_id: String(evt.id ?? ""),
            name: String(evt.name ?? ""),
            args: evt.input ?? {},
          };
        } else if (type === "tool_result") {
          yield {
            type: "tool_call_result",
            tool_call_id: String(evt.tool_use_id ?? evt.id ?? ""),
            output: evt.content ?? evt.output,
          };
        } else if (type === "result" && evt.usage && typeof evt.usage === "object") {
          const u = evt.usage as { input_tokens?: number; output_tokens?: number };
          inputTokens = u.input_tokens ?? inputTokens;
          outputTokens = u.output_tokens ?? outputTokens;
        }
      } catch {
        /* ignore */
      }
    }
  }

  const exitCode: number = await new Promise((resolve) => {
    child.once("close", (code) => resolve(typeof code === "number" ? code : 1));
  });
  if (exitCode !== 0) {
    yield {
      type: "error",
      code: `claude_exit_${exitCode}`,
      message: stderr.slice(0, 1024) || `Claude exited with ${exitCode}`,
    };
    return;
  }

  yield {
    type: "message_end",
    message_id: messageId,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_cents: 0 },
  };
}
