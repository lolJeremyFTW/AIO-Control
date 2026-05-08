// Ollama provider — talks to a local (or Tailscale-reachable) Ollama HTTP
// server. Cheap to run, perfect for low-stakes classification or quick
// lookup agents that shouldn't burn paid LLM credits.
//
// Endpoint resolution order:
//   1. opts.config.endpoint            — agent-level override
//   2. opts.tenant.ollamaEndpoint      — workspace setting (saved via the
//                                         OllamaPanel in /[ws]/settings)
//   3. process.env.OLLAMA_BASE_URL     — server default
//   4. http://localhost:11434          — last-resort default

import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import { McpHost } from "../mcp/host";
import type { StreamChatOptions } from "../router";

const ENV_HOPS_MAX = Number(process.env.AGENT_MAX_HOPS ?? "150");

type OllamaMsg =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string;
      tool_calls?: OllamaToolCall[];
    }
  | { role: "tool"; content: string };

type OllamaToolCall = {
  function: {
    name: string;
    arguments?: unknown;
    args?: unknown;
  };
};

type TurnEvent =
  | { kind: "token"; delta: string }
  | { kind: "error"; code: string; message: string }
  | {
      kind: "done";
      toolCalls: OllamaToolCall[];
      inputTokens: number;
      outputTokens: number;
    };

export async function* streamOllama(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const base =
    opts.config.endpoint ??
    opts.tenant?.ollamaEndpoint ??
    process.env.OLLAMA_BASE_URL ??
    "http://localhost:11434";
  const model = opts.config.model ?? "llama3";

  const mcpServers = opts.config.mcpServers ?? [];
  if (mcpServers.length > 0) {
    yield* streamOllamaWithMcp(opts, base, model, mcpServers);
    return;
  }

  const messageId = randomUUID();

  yield { type: "message_start", message_id: messageId, role: "assistant" };

  let response: Response;
  try {
    const messages = opts.config.systemPrompt
      ? [{ role: "system", content: opts.config.systemPrompt }, ...opts.messages]
      : opts.messages;
    response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        messages,
        options: {
          temperature: opts.config.temperature,
          num_predict: opts.config.maxTokens,
        },
      }),
    });
  } catch (err) {
    yield {
      type: "error",
      code: "ollama_network",
      message: err instanceof Error ? err.message : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield {
      type: "error",
      code: `ollama_${response.status}`,
      message: await response.text().catch(() => response.statusText),
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
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const json = JSON.parse(line) as {
          message?: { content?: string };
          done?: boolean;
          prompt_eval_count?: number;
          eval_count?: number;
        };
        const delta = json.message?.content;
        if (delta) yield { type: "token", message_id: messageId, delta };
        if (json.done) {
          inputTokens = json.prompt_eval_count ?? 0;
          outputTokens = json.eval_count ?? 0;
        }
      } catch {
        // ignore malformed lines (Ollama is generally well-behaved)
      }
    }
  }

  yield {
    type: "message_end",
    message_id: messageId,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_cents: 0 },
  };
}

async function* streamOllamaWithMcp(
  opts: StreamChatOptions,
  base: string,
  model: string,
  serverIds: string[],
): AsyncIterable<AGUIEvent> {
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

    const ollamaTools = mcpTools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const messages: OllamaMsg[] = [];
    if (opts.config.systemPrompt) {
      messages.push({ role: "system", content: opts.config.systemPrompt });
    }
    for (const m of opts.messages) {
      messages.push({ role: m.role, content: m.content } as OllamaMsg);
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let hop = 0; hop < getHopsMax(opts.config); hop++) {
      let turnText = "";
      let turnToolCalls: OllamaToolCall[] = [];
      let turnInputTokens = 0;
      let turnOutputTokens = 0;
      let turnError: { code: string; message: string } | null = null;

      for await (const ev of streamOllamaTurn({
        base,
        body: {
          model,
          stream: true,
          messages,
          tools: ollamaTools,
          options: {
            temperature: opts.config.temperature,
            num_predict: opts.config.maxTokens,
          },
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
        cost_cents: 0,
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
            cost_cents: 0,
          },
        };
        return;
      }

      messages.push({
        role: "assistant",
        content: turnText,
        tool_calls: turnToolCalls,
      });

      for (let i = 0; i < turnToolCalls.length; i++) {
        const tc = turnToolCalls[i]!;
        const toolName = tc.function.name;
        const args = tc.function.arguments ?? tc.function.args ?? {};
        const toolCallId = `ollama_${hop}_${i}`;
        yield {
          type: "tool_call_start",
          tool_call_id: toolCallId,
          name: toolName,
          args,
        };
        const result = await host.call(toolName, args);
        yield {
          type: "tool_call_result",
          tool_call_id: toolCallId,
          output: result,
        };
        messages.push({ role: "tool", content: result });
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
        cost_cents: 0,
      },
    };
  } finally {
    await host.close();
  }
}

async function* streamOllamaTurn(args: {
  base: string;
  body: Record<string, unknown>;
}): AsyncGenerator<TurnEvent> {
  let response: Response;
  try {
    response = await fetch(`${args.base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args.body),
    });
  } catch (err) {
    yield {
      kind: "error",
      code: "ollama_network",
      message: err instanceof Error ? err.message : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield {
      kind: "error",
      code: `ollama_${response.status}`,
      message: await response.text().catch(() => response.statusText),
    };
    return;
  }

  const decoder = new TextDecoder();
  let buf = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCalls: OllamaToolCall[] = [];

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const json = JSON.parse(line) as {
          message?: {
            content?: string;
            tool_calls?: OllamaToolCall[];
          };
          done?: boolean;
          prompt_eval_count?: number;
          eval_count?: number;
        };
        const delta = json.message?.content;
        if (delta) yield { kind: "token", delta };
        if (json.message?.tool_calls) {
          toolCalls.push(...json.message.tool_calls);
        }
        if (json.done) {
          inputTokens = json.prompt_eval_count ?? inputTokens;
          outputTokens = json.eval_count ?? outputTokens;
        }
      } catch {
        // Ignore malformed lines.
      }
    }
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
