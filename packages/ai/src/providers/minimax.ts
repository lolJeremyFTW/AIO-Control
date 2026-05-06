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
import { randomUUID } from "node:crypto";

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
function trimMessages(
  messages: Anthropic.MessageParam[],
  maxChars = 80_000,
): Anthropic.MessageParam[] {
  const len = (m: Anthropic.MessageParam) => JSON.stringify(m.content).length;
  const total = messages.reduce((s, m) => s + len(m), 0);
  if (total <= maxChars) return messages;

  const first = messages[0];
  const rest = messages.slice(1);
  let chars = len(first);
  const kept: Anthropic.MessageParam[] = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const l = len(rest[i]);
    if (chars + l > maxChars) break;
    kept.unshift(rest[i]);
    chars += l;
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

    const mcpTools = host.tools();
    if (mcpTools.length === 0) {
      yield {
        type: "error",
        code: "mcp_no_tools",
        message:
          "MCP host opgestart maar geen tools beschikbaar. Controleer de servers in agent.config.mcpServers.",
      };
      return;
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

    for (let hop = 0; hop < getHopsMax(opts.config); hop++) {
      let turnText = "";

      // Stream one turn from MiniMax via the Anthropic endpoint.
      const stream = client.messages.stream({
        model,
        max_tokens: opts.config.maxTokens ?? 4096,
        ...(opts.config.systemPrompt
          ? { system: opts.config.systemPrompt }
          : {}),
        tools: anthropicTools,
        tool_choice: { type: "auto" },
        messages: trimMessages(messages),
        ...(opts.config.temperature != null
          ? { temperature: opts.config.temperature }
          : {}),
      });

      // Forward token deltas live so the run drawer streams in real time.
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            turnText += event.delta.text;
            yield { type: "token", message_id: messageId, delta: event.delta.text };
          }
        }
      } catch (err) {
        yield {
          type: "error",
          code: "minimax_anthropic_stream",
          message: `MiniMax stream fout: ${err instanceof Error ? err.message : String(err)}`,
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
        // No tool calls — final turn complete.
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
    const mcpTools = host.tools();
    if (mcpTools.length === 0) {
      yield {
        type: "error",
        code: "mcp_no_tools",
        message:
          "MCP host opgestart maar geen tools beschikbaar. Controleer de servers in agent.config.mcpServers.",
      };
      return;
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
