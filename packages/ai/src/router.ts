// Provider router — every chat or worker invocation goes through here. The
// router normalises each provider's stream format into AG-UI events so the
// chat panel and any background consumers see a single shape.

import type { AGUIEvent, ChatMessage } from "./ag-ui";
import { streamClaude } from "./providers/claude";
import { streamClaudeCli } from "./providers/claude-cli";
import { streamOpenRouter } from "./providers/openrouter";
import { streamOllama } from "./providers/ollama";
import { streamMinimax } from "./providers/minimax";
import { streamMinimaxViaClaude } from "./providers/minimax-mcp";
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
  endpoint?: string; // for openclaw / hermes / custom HTTP
  headers?: Record<string, string>;
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
   *  rule jumps to a different provider) can re-look up via this. */
  tenant?: {
    workspaceId: string;
    businessId?: string | null;
    navNodeId?: string | null;
  };
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
      // Two-track: when the agent declares MCP servers (config.mcpServers
      // includes "minimax" or anything else we know how to spawn) we
      // route through Claude Code as an MCP host. Otherwise we hit the
      // normal MiniMax HTTP API directly with the user's Coder Plan key.
      if ((opts.config.mcpServers ?? []).length > 0) {
        yield* streamMinimaxViaClaude(opts);
      } else {
        yield* streamMinimax(opts);
      }
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
