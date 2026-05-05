// Provider router — every chat or worker invocation goes through here. The
// router normalises each provider's stream format into AG-UI events so the
// chat panel and any background consumers see a single shape.

import type { AGUIEvent, ChatMessage } from "./ag-ui";
import { streamClaude } from "./providers/claude";
import { streamClaudeCli } from "./providers/claude-cli";
import { streamOpenRouter } from "./providers/openrouter";
import { streamOllama } from "./providers/ollama";
import { streamMinimax } from "./providers/minimax";
// streamGenericHttp is kept for future custom HTTP providers; not
// currently routed since openclaw + hermes moved to subprocess.
import { streamHermes } from "./providers/hermes";
import { streamOpenclaw } from "./providers/openclaw";
import { streamNotConfigured } from "./providers/stub";

export type ProviderId =
  | "claude"
  | "claude_cli"
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
  /** Per-MCP-server scope flags. Today only filesystem honours this:
   *  "off" skips spawning, "ro" filters out write/edit/delete tools,
   *  "rw" (default) is full access. Other servers ignore this. */
  mcpPermissions?: {
    filesystem?: "off" | "ro" | "rw";
    aio?: "off" | "ro" | "rw";
  };
  endpoint?: string; // for openclaw / hermes / custom HTTP
  headers?: Record<string, string>;
  /** Maximum number of tool-call hops before the loop stops. Only
   *  honoured by the MiniMax provider. Falls back to the
   *  AGENT_MAX_HOPS env var (default 150) when absent. */
  maxHops?: number;
  /**
   * Per-agent smart routing. The first matching rule wins; if no rule
   * matches, the agent's base provider+model are used. Cheap-first ordering
   * (e.g. classify with Haiku, escalate to Opus on long reasoning) is the
   * point — cuts cost dramatically with no UX hit.
   */
  routingRules?: RoutingRule[];
}

export type RoutingRule = {
  /** Display label, free-form. */
  name?: string;
  match: RoutingMatch;
  use: { provider: ProviderId; model?: string };
};

export type RoutingMatch = {
  /** Match if the LATEST user message length (chars) is ≥ min and ≤ max. */
  inputLengthMin?: number;
  inputLengthMax?: number;
  /** Match if the latest user message contains ALL of these substrings (case-insensitive). */
  containsAll?: string[];
  /** Match if it contains ANY of these substrings. */
  containsAny?: string[];
  /** Match if the conversation is at least this many turns deep. */
  minTurns?: number;
};

export function pickRouted(
  base: { provider: ProviderId; config: AgentConfig },
  messages: { role: string; content: string }[],
): { provider: ProviderId; model?: string; matchedRule?: string } {
  const rules = base.config.routingRules;
  if (!rules || rules.length === 0) {
    return { provider: base.provider, model: base.config.model };
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";
  const lower = text.toLowerCase();
  for (const rule of rules) {
    const m = rule.match;
    if (m.inputLengthMin != null && text.length < m.inputLengthMin) continue;
    if (m.inputLengthMax != null && text.length > m.inputLengthMax) continue;
    if (m.containsAll && !m.containsAll.every((s) => lower.includes(s.toLowerCase())))
      continue;
    if (m.containsAny && !m.containsAny.some((s) => lower.includes(s.toLowerCase())))
      continue;
    if (m.minTurns != null && messages.filter((mm) => mm.role !== "system").length < m.minTurns)
      continue;
    return {
      provider: rule.use.provider,
      model: rule.use.model ?? base.config.model,
      matchedRule: rule.name,
    };
  }
  return { provider: base.provider, model: base.config.model };
}

export interface StreamChatOptions {
  provider: ProviderId;
  config: AgentConfig;
  messages: ChatMessage[];
  /** Pulled from the runs row so we can attribute cost back to a single run. */
  runId?: string;
  /** Resolved per-tenant API key (workspace/business/navnode override).
   *  When omitted, providers fall back to process.env.<PROVIDER>_API_KEY. */
  apiKey?: string | null;
  /** Tenancy context — providers that need a re-resolve (e.g. routing
   *  rule jumps to a different provider) can re-look up via this.
   *  Workspace-level resources like the local Ollama endpoint piggy-
   *  back here so the provider doesn't need its own DB round-trip. */
  tenant?: {
    workspaceId: string;
    businessId?: string | null;
    navNodeId?: string | null;
    /** Resolved Ollama endpoint for this workspace, e.g. http://192.168.0.42:11434.
     *  Empty when the workspace hasn't configured one — providers fall
     *  back to OLLAMA_BASE_URL / localhost. */
    ollamaEndpoint?: string | null;
    /** Persistent Hermes profile name registered for this workspace
     *  (e.g. "aio-admin"). When set, the Hermes provider invokes
     *  `<name> chat …` instead of the bare `hermes chat …` so the
     *  runtime keeps long-lived per-profile state.db / SOUL.md. */
    hermesAgentName?: string | null;
    /** Persistent OpenClaw agent name. When set, the OpenClaw
     *  provider invokes `openclaw agent <name> …` instead of
     *  `openclaw agent --local …`. */
    openclawAgentName?: string | null;
    /** Resolved API keys for MCP tool servers that need them
     *  (e.g. brave → BRAVE_API_KEY, firecrawl → FIRECRAWL_API_KEY).
     *  Injected into envOverrides when McpHost.connect() is called. */
    mcpToolKeys?: Record<string, string>;
  };
  /** Stable session id used by subprocess providers (openclaw, hermes)
   *  to keep conversational context across turns within the same chat
   *  thread. Pass the chat_thread_id when streaming from /api/chat. */
  sessionId?: string;
  /** AIO Control function-tools the agent is allowed to call this turn.
   *  Currently honoured by the Claude provider via Anthropic's
   *  tool_use; other providers will follow. When omitted no tools are
   *  exposed (model behaves as plain chat). */
  tools?: Array<{
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  }>;
}

export async function* streamChat(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  // Run smart-routing rules before dispatching. If a rule promotes us to a
  // different provider+model we replay this function once with the picked
  // values; we wrap with a simple guard so a misconfigured rule that points
  // back to itself can't loop.
  const picked = pickRouted(
    { provider: opts.provider, config: opts.config },
    opts.messages,
  );
  if (picked.provider !== opts.provider || picked.model !== opts.config.model) {
    yield* streamChat({
      ...opts,
      provider: picked.provider,
      config: { ...opts.config, model: picked.model, routingRules: undefined },
    });
    return;
  }

  switch (opts.provider) {
    case "claude":
      yield* streamClaude(opts);
      return;
    case "claude_cli":
      // Subscription-based — spawns the local `claude` CLI. No API
      // key needed; quotas come from the user's Claude Code plan.
      yield* streamClaudeCli(opts);
      return;
    case "openrouter":
      yield* streamOpenRouter(opts);
      return;
    case "ollama":
      yield* streamOllama(opts);
      return;
    case "openclaw":
      // CLI subprocess — runs `openclaw agent --local --json -m …`
      // Not HTTP (despite the name). See providers/openclaw.ts.
      yield* streamOpenclaw(opts);
      return;
    case "hermes":
      // CLI subprocess — runs `hermes chat --json --message …`
      // Set HERMES_BIN in env to the absolute path on the VPS.
      yield* streamHermes(opts);
      return;
    case "minimax":
      // streamMinimax decides internally: plain HTTP when no MCP
      // servers are configured, native multi-turn tool loop (via our
      // own MCP host, no Claude in the loop) when config.mcpServers
      // is set. The old streamMinimaxViaClaude path is gone — it
      // required Anthropic auth which most users don't have.
      yield* streamMinimax(opts);
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
