// MiniMax provider — direct HTTP path against MiniMax's
// OpenAI-compatible chat completions endpoint. Multiple bases:
//
//   https://api.minimax.io/v1/text/chatcompletion_v2     (Coder Plan,
//                                                        global)
//   https://api.minimaxi.com/v1/text/chatcompletion_v2   (international
//                                                        platform key)
//   https://api.minimax.chat/v1/text/chatcompletion_v2   (China region)
//
// When `agent.config.mcpServers` is set we additionally spawn the MCP
// servers via @modelcontextprotocol/sdk, expose their tools to MiniMax
// as OpenAI-style function tools, and run a multi-turn loop dispatching
// tool calls back to the MCP host. This means MiniMax + MCP works
// WITHOUT routing through claude-cli — i.e. without Anthropic auth.

import { randomUUID } from "node:crypto";

import type { AGUIEvent, ChatMessage } from "../ag-ui";
import { McpHost } from "../mcp/host";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const DEFAULT_BASE = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M2.7-Highspeed";
const HOPS_MAX = 6;

export async function* streamMinimax(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const mcpServers = opts.config.mcpServers ?? [];
  if (mcpServers.length > 0) {
    yield* streamMinimaxWithTools(opts, mcpServers);
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

// ── MCP-enabled path: multi-turn loop with tool dispatch ───────────

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
      // Force-pass the resolved MINIMAX_API_KEY into the MCP child so
      // it works even when the Next worker forked us without inheriting
      // env vars from the parent service. The MiniMax MCP server bails
      // with "MINIMAX_API_KEY env or header cannot be empty" otherwise.
      const permissions =
        (opts.config.mcpPermissions as
          | { filesystem?: "off" | "ro" | "rw"; aio?: "off" | "ro" | "rw" }
          | undefined) ?? {};
      const envOverrides: Record<string, string> = { MINIMAX_API_KEY: apiKey };
      // Forward the workspace id so the AIO MCP server knows which workspace to query.
      if (opts.tenant?.workspaceId) {
        envOverrides.AIO_WORKSPACE_ID = opts.tenant.workspaceId;
      }
      await host.connect(
        serverIds,
        envOverrides,
        permissions,
      );
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

    for (let hop = 0; hop < HOPS_MAX; hop++) {
      // Live-stream tokens as they come in. We buffer the per-turn
      // text alongside so we can feed the assistant turn back into
      // `messages` once the turn closes.
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

      // No tool calls → final assistant turn complete.
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

      // Append the assistant turn (text + tool_calls) into the
      // history so MiniMax can resume from this point on the next hop.
      messages.push({
        role: "assistant",
        content: turnText || null,
        tool_calls: turnToolCalls,
      });

      // Dispatch each tool call against the MCP host.
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
      // Loop continues — MiniMax gets called again with the tool results.
    }

    // Hop limit reached without a tool-free final turn. Treat the
    // accumulated text as the final response.
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
//
// One round-trip to MiniMax. Async-generator so token deltas yield as
// they arrive — that's what powers the run drawer's live streaming.
// At the very end we also yield a single "done" envelope with the
// accumulated tool_calls + usage. Errors come through as a single
// "error" event and short-circuit the stream.

type TurnEvent =
  | { kind: "token"; delta: string }
  | { kind: "error"; code: string; message: string }
  | {
      kind: "done";
      toolCalls: ToolCall[];
      inputTokens: number;
      outputTokens: number;
    };

// Plain HTTP path doesn't need tool_calls; uses this as a back-compat
// wrapper that just collects all events.
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

  // MiniMax returns HTTP 200 + a JSON envelope when the key is missing
  // or invalid. Detect that BEFORE we start reading SSE chunks.
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
  // tool_calls arrive in delta-fragments keyed by index. We accumulate
  // each slot and finalise once the stream ends.
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
