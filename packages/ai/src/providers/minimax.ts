// MiniMax provider — two paths:
//
// 1. Anthropic endpoint (default for MCP tool calls, more reliable):
//    https://api.minimax.io/v1/anthropic   (global Coder Plan)
//    Uses Anthropic SDK with custom baseURL. MiniMax's /anthropic path is
//    a drop-in Messages-API endpoint — same as Hermes Agent and OpenClaw
//    use under the hood. Tool arguments arrive as structured `input` objects
//    rather than JSON strings, eliminating the "invalid function arguments
//    json string" class of errors.
//
// 2. OpenAI-compatible endpoint (plain text, no tools):
//    https://api.minimax.io/v1/text/chatcompletion_v2   (Coder Plan, global)
//    https://api.minimaxi.com/v1/text/chatcompletion_v2 (international)
//    https://api.minimax.chat/v1/text/chatcompletion_v2 (China region)
//    Used when no MCP servers are configured (fast, cheap plain chat).

import Anthropic from "@anthropic-ai/sdk";
import { createHash, randomUUID } from "node:crypto";

import type { AGUIEvent, ChatMessage } from "../ag-ui";
import { McpHost } from "../mcp/host";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const DEFAULT_BASE = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M2.7-Highspeed";
const ENV_HOPS_MAX = Number(process.env.AGENT_MAX_HOPS ?? "150");
function getHopsMax(config: { maxHops?: number }): number {
  return config.maxHops && config.maxHops > 0 ? config.maxHops : ENV_HOPS_MAX;
}

/** Classify a MiniMax stream error for retry decisions.
 *  Returns:
 *   - "fatal"     : 4xx invalid request, context overflow — retry won't help
 *   - "rate_limit": 429 — needs LONG backoff (Token Plan = ~5 concurrent)
 *   - "transient" : 5xx / network / stall — short backoff is fine
 *   - "unknown"   : retry once with short backoff
 */
type MinimaxErrorClass = "fatal" | "rate_limit" | "transient" | "unknown";
function classifyMinimaxError(err: unknown): MinimaxErrorClass {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("429") || msg.includes("rate_limit") || msg.includes("rate limit") || msg.includes("too many requests")) {
    return "rate_limit";
  }
  // Context window / invalid request bugs won't fix themselves on retry.
  if (msg.includes("context window") || msg.includes("invalid_request_error") || msg.includes("invalid params")) {
    return "fatal";
  }
  if (msg.includes("stalled")) return "transient";
  if (msg.includes("premature close")) return "transient";
  if (msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("socket hang up")) return "transient";
  if (msg.includes("network") || msg.includes("fetch failed")) return "transient";
  if (msg.includes("overloaded")) return "transient";
  if (/\b5\d\d\b/.test(msg)) return "transient";
  if (/\b4\d\d\b/.test(msg)) return "fatal";
  return "unknown";
}

/** Compute backoff before next MiniMax retry. Rate limit = long sleep so
 *  the per-key bucket refills. Transient = quick ramp. */
function backoffMs(klass: MinimaxErrorClass, attempt: number): number {
  if (klass === "rate_limit") {
    // 30s, 60s, 120s — Token Plan refill window is ~30s.
    return Math.min(30_000 * Math.pow(2, attempt), 120_000);
  }
  // 1s, 2s, 4s for transient.
  return Math.min(1000 * Math.pow(2, attempt), 4_000);
}

/** Per-API-key concurrency guard + DB-backed 429 cooldown.
 *
 *  Concurrency: Token/Coder Plan allows ~5 concurrent connections per key;
 *  we cap at 3 to leave headroom for interactive chat. In-process Map ok
 *  here because it's enforced PER NODE PROCESS — different processes share
 *  the same Token Plan bucket but the cooldown table absorbs the overflow.
 *
 *  Cooldown: shared across all Node processes (aio-control + aio-control-root,
 *  and any other consumer of the same key) via aio_control.provider_cooldowns.
 *  When workspace A trips a 429 on :3010, workspace B's chat on :3012 sees
 *  the cooldown row and waits its turn — no double-tripping the bucket.
 *
 *  Multi-tenant: keyed by SHA-256(provider:apiKey). Same key shared across
 *  workspaces shares the cooldown (correct — same upstream bucket). Different
 *  keys are independent.
 */
const MINIMAX_MAX_CONCURRENT = Number(process.env.MINIMAX_MAX_CONCURRENT ?? "3");

type KeyState = {
  inFlight: number;
  waiters: Array<() => void>;
};
const minimaxKeyState = new Map<string, KeyState>();
const cooldownCache = new Map<
  string,
  { until: number; cachedAt: number }
>();
const COOLDOWN_CACHE_TTL_MS = 5_000;

function hashKey(apiKey: string): string {
  return createHash("sha256").update(`minimax:${apiKey}`).digest("hex");
}

function getKeyState(apiKey: string): KeyState {
  let s = minimaxKeyState.get(apiKey);
  if (!s) {
    s = { inFlight: 0, waiters: [] };
    minimaxKeyState.set(apiKey, s);
  }
  return s;
}

/** Direct Supabase REST helpers — packaged here so @aio/ai stays free of
 *  app-layer imports. Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env
 *  vars; if either is missing we silently degrade to in-process state. */
function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function readSharedCooldown(keyHash: string): Promise<number> {
  const cached = cooldownCache.get(keyHash);
  if (cached && Date.now() - cached.cachedAt < COOLDOWN_CACHE_TTL_MS) {
    return cached.until;
  }
  let until = 0;
  const env = supabaseEnv();
  if (env) {
    try {
      const r = await fetch(
        `${env.url}/rest/v1/provider_cooldowns?key_hash=eq.${encodeURIComponent(keyHash)}&select=cooldown_until&limit=1`,
        {
          headers: {
            apikey: env.key,
            Authorization: `Bearer ${env.key}`,
            "Accept-Profile": "aio_control",
          },
        },
      );
      if (r.ok) {
        const rows = (await r.json()) as { cooldown_until?: string }[];
        const v = rows[0]?.cooldown_until;
        if (v) until = new Date(v).getTime();
      }
    } catch {
      // network blip — fall back to in-process state
    }
  }
  cooldownCache.set(keyHash, { until, cachedAt: Date.now() });
  return until;
}

async function writeSharedCooldown(
  keyHash: string,
  until: number,
  reason: string,
): Promise<void> {
  cooldownCache.set(keyHash, { until, cachedAt: Date.now() });
  const env = supabaseEnv();
  if (!env) return;
  try {
    await fetch(`${env.url}/rest/v1/provider_cooldowns?on_conflict=key_hash`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        "Accept-Profile": "aio_control",
        "Content-Profile": "aio_control",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        key_hash: keyHash,
        provider: "minimax",
        cooldown_until: new Date(until).toISOString(),
        reason: reason.slice(0, 200),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("[minimax] failed to persist cooldown:", err);
  }
}

async function acquireMinimaxSlot(apiKey: string): Promise<void> {
  const s = getKeyState(apiKey);
  const keyHash = hashKey(apiKey);

  // Honor any active cooldown — DB-backed so it works across processes.
  // We loop in case multiple cooldown bumps stack up while we're waiting.
  for (let i = 0; i < 5; i++) {
    const until = await readSharedCooldown(keyHash);
    const wait = until - Date.now();
    if (wait <= 0) break;
    const capped = Math.min(wait, 120_000);
    console.log(
      `[minimax] cooldown active — sleeping ${(capped / 1000).toFixed(1)}s before next request`,
    );
    await new Promise((r) => setTimeout(r, capped));
  }

  if (s.inFlight < MINIMAX_MAX_CONCURRENT) {
    s.inFlight++;
    return;
  }
  await new Promise<void>((resolve) => s.waiters.push(resolve));
  s.inFlight++;
}

function releaseMinimaxSlot(apiKey: string): void {
  const s = getKeyState(apiKey);
  s.inFlight = Math.max(0, s.inFlight - 1);
  const next = s.waiters.shift();
  if (next) next();
}

/** Trigger a 429 cooldown for this key, shared across all processes via
 *  the provider_cooldowns table. */
function triggerCooldown(apiKey: string, attempt: number): void {
  const keyHash = hashKey(apiKey);
  // 30s, 60s, 120s — Token Plan refill window starts at ~30s. Jitter so
  // multiple processes don't wake simultaneously and re-hammer the bucket.
  const base = Math.min(30_000 * Math.pow(2, attempt), 120_000);
  const jitter = Math.floor(Math.random() * 5_000);
  const until = Date.now() + base + jitter;
  console.log(
    `[minimax] 429 — cooldown set to ${((base + jitter) / 1000).toFixed(1)}s for this key (shared)`,
  );
  void writeSharedCooldown(keyHash, until, `429 attempt ${attempt}`);
}

export async function* streamMinimax(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const mcpServers = opts.config.mcpServers ?? [];
  if (mcpServers.length > 0) {
    // Use Anthropic endpoint for tool calls — same approach as Hermes Agent
    // and OpenClaw. More reliable than OpenAI /chatcompletion_v2 because tool
    // arguments arrive as parsed objects, not streamed JSON fragments.
    yield* streamMinimaxWithToolsAnthropic(opts, mcpServers);
    return;
  }
  yield* streamMinimaxPlain(opts);
}

// ── Plain HTTP path: no tools, just streaming text ─────────────────

async function* streamMinimaxPlain(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const apiKey = opts.apiKey || process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    yield {
      type: "error",
      code: "missing_key",
      message:
        "Geen MiniMax API key gevonden. Stel 'm in via Settings → API Keys.",
    };
    return;
  }

  const base =
    opts.config.endpoint ?? process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE;
  const model =
    opts.config.model ?? process.env.MINIMAX_DEFAULT_MODEL ?? DEFAULT_MODEL;

  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const messages = opts.config.systemPrompt
    ? [{ role: "system", content: opts.config.systemPrompt }, ...opts.messages]
    : opts.messages;

  let inputTokens = 0;
  let outputTokens = 0;
  for await (const ev of streamOneTurnEvents({
    base,
    apiKey,
    model,
    body: {
      model,
      stream: true,
      messages,
      temperature: opts.config.temperature,
      max_tokens: opts.config.maxTokens,
    },
  })) {
    if (ev.kind === "token") {
      yield { type: "token", message_id: messageId, delta: ev.delta };
    } else if (ev.kind === "error") {
      yield { type: "error", code: ev.code, message: ev.message };
      return;
    } else if (ev.kind === "done") {
      inputTokens = ev.inputTokens;
      outputTokens = ev.outputTokens;
    }
  }

  yield {
    type: "message_end",
    message_id: messageId,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: priceTokens(model, inputTokens, outputTokens),
    },
  };
}

// ── Anthropic-endpoint MCP path ────────────────────────────────────
//
// Uses MiniMax's /anthropic endpoint (Anthropic Messages-API compatible).
// Tool arguments come back as parsed objects — no streaming JSON fragment
// accumulation, no "invalid function arguments json string" errors.
// This is what Hermes Agent and OpenClaw use when routing MiniMax + tools.

// Keep the first user message (the task) plus the most recent messages that
// fit within ~80 KB of serialized content (≈20K tokens). Prevents the
// accumulated multi-hop history from blowing past MiniMax's context limit.
//
// CRITICAL: never split a tool_use/tool_result pair. The Anthropic Messages
// API (and MiniMax's Anthropic-compatible endpoint) 400's with "tool id
// (callfunction…) not found" if a user message contains a tool_result
// whose corresponding assistant tool_use has been trimmed out. We walk
// backwards and bundle every (assistant-with-tool_use, user-with-tool_result)
// pair as one indivisible chunk.
function trimMessages(
  messages: Anthropic.MessageParam[],
  maxChars = 80_000,
): Anthropic.MessageParam[] {
  const len = (m: Anthropic.MessageParam) => JSON.stringify(m.content).length;
  const total = messages.reduce((s, m) => s + len(m), 0);
  if (total <= maxChars) return messages;

  const first = messages[0];
  if (!first) return messages;
  const rest = messages.slice(1);

  const isToolResultUser = (m: Anthropic.MessageParam): boolean => {
    if (m.role !== "user" || !Array.isArray(m.content)) return false;
    return m.content.some(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        "type" in c &&
        (c as { type: unknown }).type === "tool_result",
    );
  };

  let chars = len(first);
  const kept: Anthropic.MessageParam[] = [];
  let i = rest.length - 1;
  while (i >= 0) {
    const cur = rest[i];
    if (!cur) break;

    let chunk: Anthropic.MessageParam[] = [cur];
    let chunkLen = len(cur);

    // If `cur` is a user-with-tool_result, glue it to the preceding
    // assistant turn (which has the matching tool_use blocks). They MUST
    // travel together.
    const prev = i > 0 ? rest[i - 1] : undefined;
    if (isToolResultUser(cur) && prev && prev.role === "assistant") {
      chunk = [prev, cur];
      chunkLen += len(prev);
    }

    if (chars + chunkLen > maxChars) break;
    kept.unshift(...chunk);
    chars += chunkLen;
    i -= chunk.length;
  }

  // Defensive: if the first kept message is a stray user-with-tool_result
  // (lost its assistant pair somewhere upstream), drop it — sending it
  // alone guarantees a 400. Keep walking until we land on a clean message.
  while (kept.length > 0) {
    const head = kept[0];
    if (head && isToolResultUser(head)) {
      kept.shift();
      continue;
    }
    break;
  }

  return [first, ...kept];
}

async function* streamMinimaxWithToolsAnthropic(
  opts: StreamChatOptions,
  serverIds: string[],
): AsyncIterable<AGUIEvent> {
  const apiKey = opts.apiKey || process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    yield {
      type: "error",
      code: "missing_key",
      message:
        "Geen MiniMax API key gevonden. Stel 'm in via Settings → API Keys.",
    };
    return;
  }

  const base =
    opts.config.endpoint ?? process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE;
  const model =
    opts.config.model ?? process.env.MINIMAX_DEFAULT_MODEL ?? DEFAULT_MODEL;

  // MiniMax's Anthropic-compatible endpoint sits at <base>/anthropic.
  // The Anthropic SDK appends /messages automatically, so the final
  // request lands at e.g. https://api.minimax.io/v1/anthropic/messages.
  const anthropicBase = base.replace(/\/v1\/?$/, "") + "/anthropic";

  // MiniMax accepts the key via Authorization: Bearer (same as the
  // OpenAI path) rather than x-api-key. We override both so the SDK's
  // default x-api-key header is also present — one of them will match.
  const client = new Anthropic({
    apiKey,
    baseURL: anthropicBase,
    defaultHeaders: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const host = new McpHost();
  try {
    try {
      const permissions =
        (opts.config.mcpPermissions as
          | { filesystem?: "off" | "ro" | "rw"; aio?: "off" | "ro" | "rw" }
          | undefined) ?? {};
      const envOverrides: Record<string, string> = { MINIMAX_API_KEY: apiKey };
      if (opts.tenant?.workspaceId) {
        envOverrides.AIO_WORKSPACE_ID = opts.tenant.workspaceId;
      }
      // MCP tool API keys resolved by the caller and forwarded here.
      if (opts.tenant?.mcpToolKeys) {
        Object.assign(envOverrides, opts.tenant.mcpToolKeys);
      }
      await host.connect(serverIds, envOverrides, permissions);
    } catch (err) {
      yield {
        type: "error",
        code: "mcp_spawn_failed",
        message: `Kon MCP server(s) niet starten: ${err instanceof Error ? err.message : err}.`,
      };
      return;
    }

    let mcpTools = host.tools();
    if (mcpTools.length === 0) {
      // First-hop warm-up. When several runs spawn at once (retry sweep,
      // top-of-hour cron burst, post-deploy fanout), each McpHost spawns
      // its own npx process — system contention can push tool exposure
      // past 4-5s. Wait up to ~25s with progressively longer pauses so
      // we don't give up before npx has a chance to install + start.
      for (let warmup = 0; warmup < 8 && mcpTools.length === 0; warmup++) {
        await new Promise((r) => setTimeout(r, 1500 + warmup * 500));
        try {
          await host.connect(serverIds, { MINIMAX_API_KEY: apiKey }, {});
        } catch {
          // ignore — final tools() check below decides
        }
        mcpTools = host.tools();
      }
      if (mcpTools.length === 0) {
        yield {
          type: "error",
          code: "mcp_no_tools",
          message:
            "MCP host opgestart maar geen tools beschikbaar. Controleer de servers in agent.config.mcpServers.",
        };
        return;
      }
    }

    // Convert MCP tool definitions to Anthropic format.
    const anthropicTools: Anthropic.Tool[] = mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object" as const,
        properties:
          (t.parameters as { properties?: Record<string, unknown> })
            ?.properties ?? {},
        required:
          (t.parameters as { required?: string[] })?.required ?? [],
      },
    }));

    // Build initial message history. The Anthropic SDK wants alternating
    // user/assistant turns — system goes in the top-level `system` param.
    const messages: Anthropic.MessageParam[] = opts.messages
      .filter(
        (m): m is ChatMessage =>
          m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let assistantTextSoFar = "";

    // Per-stream stall watchdog — if no SSE event arrives for this many ms,
    // abort the request. MiniMax's Anthropic endpoint sometimes stops
    // emitting deltas without closing the stream, leaving the run hung.
    // 90s is generous: a slow model still emits tokens every few seconds.
    const STREAM_STALL_MS = Number(
      process.env.MINIMAX_STREAM_STALL_MS ?? "90000",
    );

    for (let hop = 0; hop < getHopsMax(opts.config); hop++) {
      let turnText = "";

      const abortController = new AbortController();
      let stallTimer: NodeJS.Timeout | null = null;
      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          abortController.abort(
            new Error(
              `MiniMax stream stalled — geen events binnen ${STREAM_STALL_MS / 1000}s`,
            ),
          );
        }, STREAM_STALL_MS);
      };
      resetStallTimer();

      // Per-hop retry — backoff scales by error class (rate_limit gets
      // 30-120s sleep so the per-key bucket can refill). 4xx fatal errors
      // fail fast; transient gets a short ramp.
      let stream: ReturnType<typeof client.messages.stream> | null = null;
      let streamErr: unknown = null;
      const MAX_RETRIES = 3;
      let lastClass: MinimaxErrorClass = "unknown";
      retryLoop: for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise((r) =>
            setTimeout(r, backoffMs(lastClass, attempt - 1)),
          );
        }
        // Concurrency guard — per-key, so workspaces with separate keys
        // don't block each other. Also honors any active 429 cooldown.
        await acquireMinimaxSlot(apiKey);
        stream = client.messages.stream(
          {
            model,
            max_tokens: opts.config.maxTokens ?? 4096,
            ...(opts.config.systemPrompt
              ? { system: opts.config.systemPrompt }
              : {}),
            tools: anthropicTools,
            tool_choice: { type: "auto" },
            // trimMessages prevents the "context window exceeds limit" 400
            // class of errors when long-running runs accumulate hops of
            // tool input/output that bust MiniMax's input cap.
            messages: trimMessages(messages),
            ...(opts.config.temperature != null
              ? { temperature: opts.config.temperature }
              : {}),
          },
          { signal: abortController.signal },
        );

        turnText = "";
        try {
          for await (const event of stream) {
            // Reset the stall timer on every event — including non-text ones
            // like content_block_start/stop, so a long tool-arg stream doesn't
            // trip the watchdog.
            resetStallTimer();
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              turnText += event.delta.text;
              yield {
                type: "token",
                message_id: messageId,
                delta: event.delta.text,
              };
            }
          }
          releaseMinimaxSlot(apiKey);
          streamErr = null;
          break retryLoop;
        } catch (err) {
          releaseMinimaxSlot(apiKey);
          streamErr = err;
          lastClass = classifyMinimaxError(err);
          // 429 → trigger global cooldown for this key so subsequent
          // acquires sleep instead of hammering the same bucket again.
          if (lastClass === "rate_limit") {
            triggerCooldown(apiKey, attempt);
          }
          // Reset the stall watchdog so the next attempt gets a fresh timer.
          if (stallTimer) clearTimeout(stallTimer);
          resetStallTimer();
          if (lastClass === "fatal" || attempt === MAX_RETRIES) {
            break retryLoop;
          }
        }
      }
      if (stallTimer) clearTimeout(stallTimer);
      if (streamErr) {
        yield {
          type: "error",
          code: "minimax_anthropic_stream",
          message: `MiniMax stream fout: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}`,
        };
        return;
      }
      if (!stream) {
        yield {
          type: "error",
          code: "minimax_anthropic_stream",
          message: "MiniMax stream niet geinitialiseerd",
        };
        return;
      }

      const finalMsg = await stream.finalMessage();
      totalInputTokens += finalMsg.usage.input_tokens;
      totalOutputTokens += finalMsg.usage.output_tokens;
      assistantTextSoFar += turnText;

      yield {
        type: "cost_update",
        cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      };

      // Collect tool_use blocks from this turn.
      const toolUseBlocks = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // Empty-turn detector: MiniMax sometimes returns stop_reason=end_turn
        // with NO text and NO tool_use — a "ghost done" where the model just
        // gave up. Don't trust that as a real completion: nudge the model
        // once with a continuation prompt and try again. If it still returns
        // empty, we accept it as the agent's final word.
        const isEmptyTurn =
          turnText.trim().length === 0 &&
          assistantTextSoFar.trim().length === 0 &&
          finalMsg.stop_reason === "end_turn";
        if (isEmptyTurn && hop < getHopsMax(opts.config) - 1) {
          console.log(
            "[minimax] empty end_turn — nudging the model to continue",
          );
          // Push the empty assistant turn (so the next user message is
          // a valid alternation) then a nudge.
          messages.push({ role: "assistant", content: finalMsg.content });
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Je vorige beurt was leeg. Ga door met de taak — voer de volgende stap uit, of geef een kort eindrapport als je klaar bent.",
              },
            ],
          });
          continue; // → next hop iteration
        }
        // No tool calls and not an empty-ghost — final turn complete.
        yield {
          type: "message_end",
          message_id: messageId,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
          },
        };
        return;
      }

      // Append the full assistant turn (text + tool_use blocks) so
      // MiniMax can resume from here on the next hop.
      messages.push({ role: "assistant", content: finalMsg.content });

      // Execute each tool call and collect results.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tc of toolUseBlocks) {
        yield {
          type: "tool_call_start",
          tool_call_id: tc.id,
          name: tc.name,
          args: tc.input,
        };
        const result = await host.call(tc.name, tc.input);
        yield {
          type: "tool_call_result",
          tool_call_id: tc.id,
          output: result,
        };
        toolResults.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: result,
        });
      }

      // Feed tool results back as a user turn so MiniMax continues.
      messages.push({ role: "user", content: toolResults });

      // Signal a new assistant turn to the dispatcher so it creates a
      // fresh bubble positioned AFTER the tool call cards, not before.
      yield { type: "message_start", message_id: randomUUID(), role: "assistant" };
    }

    // Hop limit reached — emit what we have as the final response.
    yield {
      type: "message_end",
      message_id: messageId,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
      },
    };
    void assistantTextSoFar;
  } finally {
    await host.close();
  }
}

// ── OpenAI-compatible multi-turn loop (kept for reference / fallback) ─
//
// Previously the default MCP path. Replaced by streamMinimaxWithToolsAnthropic
// because MiniMax's /chatcompletion_v2 endpoint occasionally emits malformed
// tool argument JSON ("invalid function arguments json string"). Not currently
// called but retained so it can be re-enabled via a config flag if needed.

type OAIMsg =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

async function* streamMinimaxWithTools(
  opts: StreamChatOptions,
  serverIds: string[],
): AsyncIterable<AGUIEvent> {
  const apiKey = opts.apiKey || process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    yield {
      type: "error",
      code: "missing_key",
      message:
        "Geen MiniMax API key gevonden. Stel 'm in via Settings → API Keys.",
    };
    return;
  }
  const base =
    opts.config.endpoint ?? process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE;
  const model =
    opts.config.model ?? process.env.MINIMAX_DEFAULT_MODEL ?? DEFAULT_MODEL;

  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const host = new McpHost();
  try {
    try {
      const permissions =
        (opts.config.mcpPermissions as
          | { filesystem?: "off" | "ro" | "rw"; aio?: "off" | "ro" | "rw" }
          | undefined) ?? {};
      const envOverrides: Record<string, string> = { MINIMAX_API_KEY: apiKey };
      if (opts.tenant?.workspaceId) {
        envOverrides.AIO_WORKSPACE_ID = opts.tenant.workspaceId;
      }
      if (opts.tenant?.mcpToolKeys) {
        Object.assign(envOverrides, opts.tenant.mcpToolKeys);
      }
      await host.connect(serverIds, envOverrides, permissions);
    } catch (err) {
      yield {
        type: "error",
        code: "mcp_spawn_failed",
        message: `Kon MCP server(s) niet starten: ${err instanceof Error ? err.message : err}. Controleer of npx beschikbaar is en MINIMAX_API_KEY in env staat.`,
      };
      return;
    }
    let mcpTools = host.tools();
    if (mcpTools.length === 0) {
      // First-hop warm-up. When several runs spawn at once (retry sweep,
      // top-of-hour cron burst, post-deploy fanout), each McpHost spawns
      // its own npx process — system contention can push tool exposure
      // past 4-5s. Wait up to ~25s with progressively longer pauses so
      // we don't give up before npx has a chance to install + start.
      for (let warmup = 0; warmup < 8 && mcpTools.length === 0; warmup++) {
        await new Promise((r) => setTimeout(r, 1500 + warmup * 500));
        try {
          await host.connect(serverIds, { MINIMAX_API_KEY: apiKey }, {});
        } catch {
          // ignore — final tools() check below decides
        }
        mcpTools = host.tools();
      }
      if (mcpTools.length === 0) {
        yield {
          type: "error",
          code: "mcp_no_tools",
          message:
            "MCP host opgestart maar geen tools beschikbaar. Controleer de servers in agent.config.mcpServers.",
        };
        return;
      }
    }

    const oaiTools = mcpTools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const messages: OAIMsg[] = [];
    if (opts.config.systemPrompt) {
      messages.push({ role: "system", content: opts.config.systemPrompt });
    }
    for (const m of opts.messages as ChatMessage[]) {
      messages.push({ role: m.role, content: m.content } as OAIMsg);
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let assistantTextSoFar = "";

    for (let hop = 0; hop < getHopsMax(opts.config); hop++) {
      let turnText = "";
      let turnToolCalls: ToolCall[] = [];
      let turnInputTokens = 0;
      let turnOutputTokens = 0;
      let turnError: { code: string; message: string } | null = null;

      for await (const ev of streamOneTurnEvents({
        base,
        apiKey,
        model,
        body: {
          model,
          stream: true,
          messages,
          tools: oaiTools,
          tool_choice: "auto",
          temperature: opts.config.temperature,
          max_tokens: opts.config.maxTokens,
        },
      })) {
        if (ev.kind === "token") {
          turnText += ev.delta;
          yield { type: "token", message_id: messageId, delta: ev.delta };
        } else if (ev.kind === "error") {
          turnError = { code: ev.code, message: ev.message };
        } else if (ev.kind === "done") {
          turnToolCalls = ev.toolCalls;
          turnInputTokens = ev.inputTokens;
          turnOutputTokens = ev.outputTokens;
        }
      }

      if (turnError) {
        yield { type: "error", code: turnError.code, message: turnError.message };
        return;
      }

      totalInputTokens += turnInputTokens;
      totalOutputTokens += turnOutputTokens;
      assistantTextSoFar += turnText;

      yield {
        type: "cost_update",
        cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      };

      if (turnToolCalls.length === 0) {
        yield {
          type: "message_end",
          message_id: messageId,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            cost_cents: priceTokens(
              model,
              totalInputTokens,
              totalOutputTokens,
            ),
          },
        };
        return;
      }

      messages.push({
        role: "assistant",
        content: turnText || null,
        tool_calls: turnToolCalls,
      });

      for (const tc of turnToolCalls) {
        let argsObj: unknown = {};
        try {
          argsObj = tc.function.arguments
            ? JSON.parse(tc.function.arguments)
            : {};
        } catch {
          argsObj = { _raw: tc.function.arguments };
        }
        yield {
          type: "tool_call_start",
          tool_call_id: tc.id,
          name: tc.function.name,
          args: argsObj,
        };
        const result = await host.call(tc.function.name, argsObj);
        yield {
          type: "tool_call_result",
          tool_call_id: tc.id,
          output: result,
        };
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    yield {
      type: "message_end",
      message_id: messageId,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_cents: priceTokens(
          model,
          totalInputTokens,
          totalOutputTokens,
        ),
      },
    };
    void assistantTextSoFar;
  } finally {
    await host.close();
  }
}

// ── shared single-turn helper ──────────────────────────────────────

type TurnEvent =
  | { kind: "token"; delta: string }
  | { kind: "error"; code: string; message: string }
  | {
      kind: "done";
      toolCalls: ToolCall[];
      inputTokens: number;
      outputTokens: number;
    };

type TurnResult =
  | { kind: "error"; code: string; message: string }
  | {
      kind: "ok";
      tokens: string[];
      toolCalls: ToolCall[];
      inputTokens: number;
      outputTokens: number;
    };

async function streamOneTurn(args: {
  base: string;
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
}): Promise<TurnResult> {
  const tokens: string[] = [];
  let toolCalls: ToolCall[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const ev of streamOneTurnEvents(args)) {
    if (ev.kind === "token") tokens.push(ev.delta);
    else if (ev.kind === "error")
      return { kind: "error", code: ev.code, message: ev.message };
    else if (ev.kind === "done") {
      toolCalls = ev.toolCalls;
      inputTokens = ev.inputTokens;
      outputTokens = ev.outputTokens;
    }
  }
  return { kind: "ok", tokens, toolCalls, inputTokens, outputTokens };
}

async function* streamOneTurnEvents(args: {
  base: string;
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
}): AsyncGenerator<TurnEvent> {
  let response: Response;
  try {
    response = await fetch(`${args.base}/text/chatcompletion_v2`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(args.body),
    });
  } catch (err) {
    yield {
      kind: "error",
      code: "minimax_network",
      message: err instanceof Error ? err.message : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield {
      kind: "error",
      code: `minimax_${response.status}`,
      message: await response.text().catch(() => response.statusText),
    };
    return;
  }

  const ctype = response.headers.get("content-type") ?? "";
  if (ctype.includes("application/json") && !ctype.includes("event-stream")) {
    const body = await response.text().catch(() => "");
    let msg = body;
    try {
      const j = JSON.parse(body) as {
        base_resp?: { status_code?: number; status_msg?: string };
      };
      if (j.base_resp?.status_msg) msg = j.base_resp.status_msg;
    } catch {
      /* keep raw body */
    }
    yield {
      kind: "error",
      code: "minimax_invalid_response",
      message: `MiniMax: ${msg}`,
    };
    return;
  }

  const decoder = new TextDecoder();
  let buf = "";
  const toolCallSlots: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map();
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const raw = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!raw.startsWith("data:")) continue;
      const payload = raw.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) yield { kind: "token", delta: delta.content };
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            const slot = toolCallSlots.get(i) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments)
              slot.arguments += tc.function.arguments;
            toolCallSlots.set(i, slot);
          }
        }
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens ?? inputTokens;
          outputTokens = json.usage.completion_tokens ?? outputTokens;
        }
      } catch {
        // tolerate keep-alives / malformed lines
      }
    }
  }

  const toolCalls: ToolCall[] = [];
  const indices = Array.from(toolCallSlots.keys()).sort((a, b) => a - b);
  for (const i of indices) {
    const s = toolCallSlots.get(i);
    if (!s || !s.name) continue;
    toolCalls.push({
      id: s.id || `call_${i}`,
      type: "function",
      function: { name: s.name, arguments: s.arguments },
    });
  }

  yield { kind: "done", toolCalls, inputTokens, outputTokens };
}

// Keep streamOneTurn exported for any future direct callers.
export { streamOneTurn };
