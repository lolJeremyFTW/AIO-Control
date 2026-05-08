// OpenRouter provider — OpenAI-compatible streaming endpoint covering 100+
// models. We hand-roll the SSE parse because we don't want to pull in the
// full openai SDK just for fetch + chunk handling.

import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import { McpHost } from "../mcp/host";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const ENV_HOPS_MAX = Number(process.env.AGENT_MAX_HOPS ?? "150");

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

type TurnEvent =
  | { kind: "token"; delta: string }
  | { kind: "error"; code: string; message: string }
  | {
      kind: "done";
      toolCalls: ToolCall[];
      inputTokens: number;
      outputTokens: number;
    };

export async function* streamOpenRouter(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    yield {
      type: "error",
      code: "missing_key",
      message:
        "Geen OpenRouter API key gevonden. Stel 'm in via Settings → API Keys.",
    };
    return;
  }

  const mcpServers = opts.config.mcpServers ?? [];
  if (mcpServers.length > 0) {
    yield* streamOpenRouterWithMcp(opts, apiKey, mcpServers);
    return;
  }

  const model = opts.config.model ?? "openrouter/auto";
  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  let response: Response;
  try {
    const messages = opts.config.systemPrompt
      ? [{ role: "system", content: opts.config.systemPrompt }, ...opts.messages]
      : opts.messages;

    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://tromptech.life",
        "X-Title": "AIO Control",
      },
      body: JSON.stringify({
        model,
        stream: true,
        usage: { include: true },
        messages,
        temperature: opts.config.temperature,
        max_tokens: opts.config.maxTokens,
      }),
    });
  } catch (err) {
    yield {
      type: "error",
      code: "openrouter_network",
      message: err instanceof Error ? err.message : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    yield {
      type: "error",
      code: `openrouter_${response.status}`,
      message: text || response.statusText,
    };
    return;
  }

  const decoder = new TextDecoder();
  let buf = "";
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
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          yield { type: "token", message_id: messageId, delta };
        }
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens ?? inputTokens;
          outputTokens = json.usage.completion_tokens ?? outputTokens;
        }
      } catch {
        // ignore malformed line; OpenRouter occasionally sends keep-alives.
      }
    }
  }

  yield {
    type: "message_end",
    message_id: messageId,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: priceTokens(opts.config.model, inputTokens, outputTokens),
    },
  };
}

async function* streamOpenRouterWithMcp(
  opts: StreamChatOptions,
  apiKey: string,
  serverIds: string[],
): AsyncIterable<AGUIEvent> {
  const model = opts.config.model ?? "openrouter/auto";
  let messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const host = new McpHost();
  try {
    try {
      const permissions =
        (opts.config.mcpPermissions as
          | { filesystem?: "off" | "ro" | "rw"; aio?: "off" | "ro" | "rw" }
          | undefined) ?? {};
      await host.connect(serverIds, buildMcpEnv(opts), permissions);
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
    for (const m of opts.messages) {
      if (m.role === "system") {
        messages.push({ role: "system", content: m.content });
      } else {
        messages.push({ role: m.role, content: m.content } as OAIMsg);
      }
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let hop = 0; hop < getHopsMax(opts.config); hop++) {
      let turnText = "";
      let turnToolCalls: ToolCall[] = [];
      let turnInputTokens = 0;
      let turnOutputTokens = 0;
      let turnError: { code: string; message: string } | null = null;

      for await (const ev of streamOpenRouterTurn({
        apiKey,
        body: {
          model,
          stream: true,
          usage: { include: true },
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
        } else {
          turnToolCalls = ev.toolCalls;
          turnInputTokens = ev.inputTokens;
          turnOutputTokens = ev.outputTokens;
        }
      }

      if (turnError) {
        yield {
          type: "error",
          code: turnError.code,
          message: turnError.message,
        };
        return;
      }

      totalInputTokens += turnInputTokens;
      totalOutputTokens += turnOutputTokens;

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
            cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
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
        const args = parseArgs(tc.function.arguments);
        yield {
          type: "tool_call_start",
          tool_call_id: tc.id,
          name: tc.function.name,
          args,
        };
        const result = await host.call(tc.function.name, args);
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

      messageId = randomUUID();
      yield { type: "message_start", message_id: messageId, role: "assistant" };
    }

    yield {
      type: "message_end",
      message_id: messageId,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
      },
    };
  } finally {
    await host.close();
  }
}

async function* streamOpenRouterTurn(args: {
  apiKey: string;
  body: Record<string, unknown>;
}): AsyncGenerator<TurnEvent> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${args.apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://tromptech.life",
        "X-Title": "AIO Control",
      },
      body: JSON.stringify(args.body),
    });
  } catch (err) {
    yield {
      kind: "error",
      code: "openrouter_network",
      message: err instanceof Error ? err.message : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield {
      kind: "error",
      code: `openrouter_${response.status}`,
      message: (await response.text().catch(() => "")) || response.statusText,
    };
    return;
  }

  const decoder = new TextDecoder();
  let buf = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCallSlots = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

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
            if (tc.function?.arguments) {
              slot.arguments += tc.function.arguments;
            }
            toolCallSlots.set(i, slot);
          }
        }
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens ?? inputTokens;
          outputTokens = json.usage.completion_tokens ?? outputTokens;
        }
      } catch {
        // Ignore malformed keep-alive lines.
      }
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const i of Array.from(toolCallSlots.keys()).sort((a, b) => a - b)) {
    const slot = toolCallSlots.get(i);
    if (!slot?.name) continue;
    toolCalls.push({
      id: slot.id || `call_${i}`,
      type: "function",
      function: { name: slot.name, arguments: slot.arguments },
    });
  }

  yield { kind: "done", toolCalls, inputTokens, outputTokens };
}

function buildMcpEnv(opts: StreamChatOptions): Record<string, string> {
  const env: Record<string, string> = {
    ...(opts.tenant?.mcpToolKeys ?? {}),
  };
  if (opts.tenant?.workspaceId) env.AIO_WORKSPACE_ID = opts.tenant.workspaceId;
  if (opts.tenant && "businessId" in opts.tenant) {
    env.AIO_BUSINESS_ID = opts.tenant.businessId ?? "";
  }
  if (opts.tenant && "navNodeId" in opts.tenant) {
    env.AIO_NAV_NODE_ID = opts.tenant.navNodeId ?? "";
  }
  if (opts.tenant && "agentId" in opts.tenant) {
    env.AIO_AGENT_ID = opts.tenant.agentId ?? "";
  }
  if (opts.tenant && "scheduleId" in opts.tenant) {
    env.AIO_SCHEDULE_ID = opts.tenant.scheduleId ?? "";
  }
  if (opts.runId) env.AIO_RUN_ID = opts.runId;
  return env;
}

function getHopsMax(config: { maxHops?: number }): number {
  return config.maxHops && config.maxHops > 0 ? config.maxHops : ENV_HOPS_MAX;
}

function parseArgs(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text };
  }
}
