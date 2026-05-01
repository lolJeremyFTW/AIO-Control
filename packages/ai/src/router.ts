// Provider router — every chat or worker invocation goes through here. The
// router normalises each provider's stream format into AG-UI events so the
// chat panel and any background consumers see a single shape.

import type { AGUIEvent, ChatMessage } from "./ag-ui";
import { streamClaude } from "./providers/claude";
import { streamOpenRouter } from "./providers/openrouter";
import { streamOllama } from "./providers/ollama";
import { streamGenericHttp } from "./providers/generic-http";
import { streamNotConfigured } from "./providers/stub";

export type ProviderId =
  | "claude"
  | "openrouter"
  | "minimax"
  | "ollama"
  | "openclaw"
  | "hermes"
  | "codex";

export interface AgentConfig {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  mcpServers?: string[];
  endpoint?: string; // for openclaw / hermes / custom HTTP
  headers?: Record<string, string>;
}

export interface StreamChatOptions {
  provider: ProviderId;
  config: AgentConfig;
  messages: ChatMessage[];
  /** Pulled from the runs row so we can attribute cost back to a single run. */
  runId?: string;
}

export async function* streamChat(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  switch (opts.provider) {
    case "claude":
      yield* streamClaude(opts);
      return;
    case "openrouter":
      yield* streamOpenRouter(opts);
      return;
    case "ollama":
      yield* streamOllama(opts);
      return;
    case "openclaw":
    case "hermes":
      // user's own services — generic HTTP relay, OpenAI-ish wire format
      yield* streamGenericHttp(opts);
      return;
    case "minimax":
      // MiniMax Coding Plan is MCP-only. We fall back to a stub here; phase 4
      // wires it up via Claude Code subprocess + MCP relay.
      yield* streamNotConfigured(opts, "MiniMax MCP relay komt in fase 4.");
      return;
    case "codex":
      // Codex models are reachable through OpenRouter with an alias prefix;
      // wire that in phase 4 — for now we send users through a clear error.
      yield* streamNotConfigured(opts, "Codex provider komt in fase 4.");
      return;
    default:
      yield {
        type: "error",
        code: "unknown_provider",
        message: `Unknown provider: ${opts.provider as string}`,
      };
  }
}
