// Provider router — phase-3 will fill in actual provider implementations.
// This file currently only defines the public types the rest of the monorepo
// can rely on.

import type { AGUIEvent, ChatMessage } from "./ag-ui";

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
  endpoint?: string; // for openclaw / hermes / custom
}

export interface StreamChatOptions {
  provider: ProviderId;
  config: AgentConfig;
  messages: ChatMessage[];
}

export async function* streamChat(
  _opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  // Implemented in phase 3.
  yield {
    type: "error",
    code: "not_implemented",
    message: "Provider router is not implemented yet (lands in phase 3).",
  };
}
