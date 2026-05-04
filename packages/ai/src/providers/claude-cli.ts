// Claude Code CLI provider — uses the user's `claude` CLI subscription
// (Pro / Max / Team) instead of an Anthropic API key. Spawns a
// subprocess in --print mode and parses the stream-json output.
//
// This is the "free" Claude — every call counts against the
// subscription's quota, not against an API balance. Ideal when the
// user has Claude Code installed on the same host as AIO Control.
//
// Triggered by provider="claude_cli" on the agent. The agent's
// model field becomes --model (e.g. "sonnet", "opus", or a full
// claude-3-7-sonnet-20250219 id). Leave empty to use Claude's
// default.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";
import { resolveCliBin } from "./cli-bin";

export async function* streamClaudeCli(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const messageId = randomUUID();

  // Pull the most recent user message — Claude CLI's --print mode
  // takes a single prompt on stdin. Earlier turns are passed via
  // --resume <session-id> in a future iteration; for phase 1 we
  // collapse the conversation into one prompt.
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";
  if (!prompt) {
    yield {
      type: "error",
      code: "empty_prompt",
      message: "Geen user-message gevonden om naar Claude CLI te sturen.",
    };
    return;
  }

  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const args: string[] = [
    "--print",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];
  if (opts.config.systemPrompt) {
    args.push("--append-system-prompt", opts.config.systemPrompt);
  }
  if (opts.config.model) {
    args.push("--model", opts.config.model);
  }
  // Surface MCP servers if the agent declared any — same pattern as
  // streamMinimaxViaClaude but without forcing minimax.
  if ((opts.config.mcpServers ?? []).length > 0) {
    // Caller is expected to configure mcp servers via an explicit
    // --mcp-config; we don't synthesise it here. (Use streamMinimax
    // ViaClaude for the auto-config flow.)
    // Skip silently.
  }

  // resolveCliBin walks ~/.npm-global, /opt/homebrew, /usr/local, /usr,
  // /snap so a default Linux/Mac install of Claude Code is found
  // automatically. CLAUDE_BIN env still overrides for non-standard paths.
  const binary = resolveCliBin("claude", "CLAUDE_BIN");
  const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.write(prompt);
  child.stdin.end();

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  // If `claude` isn't installed we get an ENOENT here.
  const earlyErr = await new Promise<Error | null>((resolve) => {
    child.once("error", (err) => resolve(err));
    setTimeout(() => resolve(null), 50);
  });
  if (earlyErr) {
    yield {
      type: "error",
      code: "claude_cli_missing",
      message:
        `Claude CLI niet beschikbaar (${earlyErr.message}). ` +
        `Installeer Claude Code op de VPS of zet het claude binary in PATH.`,
    };
    return;
  }

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

        // The CLI's stream-json output uses Anthropic's event names:
        //   {type:"content_block_delta", delta:{type:"text_delta", text:"..."}}
        // plus our own assistant-text wrapper for partials.
        if (
          type === "content_block_delta" &&
          (evt.delta as { type?: string } | undefined)?.type === "text_delta"
        ) {
          const delta = (evt.delta as { text?: string }).text;
          if (delta) yield { type: "token", message_id: messageId, delta };
        } else if (type === "assistant" && typeof evt.text === "string") {
          // Some claude versions emit a flat assistant message.
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
        } else if (
          type === "message_delta" &&
          typeof (evt.usage as { input_tokens?: number } | undefined)
            ?.input_tokens === "number"
        ) {
          const u = evt.usage as {
            input_tokens?: number;
            output_tokens?: number;
          };
          inputTokens = u.input_tokens ?? inputTokens;
          outputTokens = u.output_tokens ?? outputTokens;
        } else if (type === "result" && evt.usage && typeof evt.usage === "object") {
          const u = evt.usage as { input_tokens?: number; output_tokens?: number };
          inputTokens = u.input_tokens ?? inputTokens;
          outputTokens = u.output_tokens ?? outputTokens;
        }
      } catch {
        /* keep-alives + non-json lines */
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
      message: stderr.slice(0, 1024) || `Claude CLI exited with ${exitCode}`,
    };
    return;
  }

  // Cost stays at 0 — subscription users don't get billed per token.
  yield {
    type: "message_end",
    message_id: messageId,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: 0,
    },
  };
}
