// Claude provider — streams via the Anthropic SDK. We don't hand-roll the
// Messages API call; the SDK handles SSE chunking + retries + version
// headers for us.
//
// Tool-use: two paths depending on agent config.
//   1. AIO tools (default) — when opts.tools is set. The chat-route
//      executes tools server-side and re-invokes us with tool_result msgs.
//   2. MCP tools — when opts.config.mcpServers is set. We spawn MCP servers
//      via McpHost, run the full multi-hop loop inside this function, and
//      emit tool_call_start + tool_call_result events live. Same behaviour
//      as the MiniMax Anthropic path, just without the custom baseURL.

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";

import type { AGUIEvent, ChatMessage } from "../ag-ui";
import { McpHost } from "../mcp/host";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const ENV_HOPS_MAX = Number(process.env.AGENT_MAX_HOPS ?? "150");
function getHopsMax(config: { maxHops?: number }): number {
  return config.maxHops && config.maxHops > 0 ? config.maxHops : ENV_HOPS_MAX;
}

/**
 * The chat route can pre-format the messages array with tool_use +
 * tool_result blocks (see lib/agents/tool-execution.ts). When that
 * happens the message.content is a JSON-stringified array of blocks
 * rather than a plain string. We detect that and pass through.
 */
function decodeBlocks(content: string): unknown[] | null {
  if (!content.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* not a blocks array, treat as plain text below */
  }
  return null;
}

export async function* streamClaude(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield {
      type: "error",
      code: "missing_key",
      message:
        "Geen Anthropic API key gevonden. Stel 'm in via Settings → API Keys (workspace, business of topic).",
    };
    return;
  }

  // When MCP servers are configured, delegate to the full MCP loop.
  const mcpServers = opts.config.mcpServers ?? [];
  if (mcpServers.length > 0) {
    yield* streamClaudeWithMcp(opts, apiKey, mcpServers);
    return;
  }

  // ── Plain path: AIO tools handled by the chat-route loop ──────────
  const client = new Anthropic({ apiKey });

  const model = opts.config.model ?? DEFAULT_MODEL;
  const messageId = randomUUID();
  let inputTokens = 0;
  let outputTokens = 0;

  yield { type: "message_start", message_id: messageId, role: "assistant" };

  try {
    const messages = opts.messages
      .filter((m): m is ChatMessage => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const blocks = decodeBlocks(m.content);
        return blocks
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ role: m.role, content: blocks as any })
          : { role: m.role, content: m.content };
      });

    // Convert AIO tool specs to Anthropic's Tool object shape.
    const tools = (opts.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object" as const,
        properties: t.parameters.properties,
        required: t.parameters.required,
      },
    }));

    const stream = await client.messages.stream({
      model,
      max_tokens: opts.config.maxTokens ?? 1024,
      system: opts.config.systemPrompt,
      temperature: opts.config.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      ...(tools.length > 0 ? { tools } : {}),
    });

    // Track tool_use blocks as we see them so we can emit a final
    // tool_call_start with the assembled args. Anthropic streams the
    // input_json piece-by-piece via input_json_delta blocks.
    type ToolUseBuf = { id: string; name: string; jsonAcc: string };
    const toolUses = new Map<number, ToolUseBuf>();

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          toolUses.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            jsonAcc: "",
          });
        }
      }
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield {
            type: "token",
            message_id: messageId,
            delta: event.delta.text,
          };
        }
        if (event.delta.type === "input_json_delta") {
          const buf = toolUses.get(event.index);
          if (buf) buf.jsonAcc += event.delta.partial_json;
        }
      }
      if (event.type === "content_block_stop") {
        const buf = toolUses.get(event.index);
        if (buf) {
          let args: unknown = {};
          try {
            args = buf.jsonAcc ? JSON.parse(buf.jsonAcc) : {};
          } catch {
            args = { _raw: buf.jsonAcc };
          }
          yield {
            type: "tool_call_start",
            tool_call_id: buf.id,
            name: buf.name,
            args,
          };
        }
      }
      if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens;
      }
      if (event.type === "message_start" && event.message.usage) {
        inputTokens = event.message.usage.input_tokens ?? 0;
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
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Claude streaming failed.";
    yield { type: "error", code: "claude_error", message };
  }
}

// ── MCP path: full multi-hop loop with McpHost ────────────────────────────
// Same logic as streamMinimaxWithToolsAnthropic in minimax.ts, but using
// the standard Anthropic API endpoint (no custom baseURL or Bearer header).

async function* streamClaudeWithMcp(
  opts: StreamChatOptions,
  apiKey: string,
  serverIds: string[],
): AsyncIterable<AGUIEvent> {
  const client = new Anthropic({ apiKey });
  const model = opts.config.model ?? DEFAULT_MODEL;

  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const host = new McpHost();
  try {
    try {
      const permissions =
        (opts.config.mcpPermissions as
          | { filesystem?: "off" | "ro" | "rw"; aio?: "off" | "ro" | "rw" }
          | undefined) ?? {};
      const envOverrides: Record<string, string> = {};
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

    const messages: Anthropic.MessageParam[] = opts.messages
      .filter(
        (m): m is ChatMessage =>
          m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let hop = 0; hop < getHopsMax(opts.config); hop++) {
      let turnText = "";

      const stream = client.messages.stream({
        model,
        max_tokens: opts.config.maxTokens ?? 4096,
        ...(opts.config.systemPrompt
          ? { system: opts.config.systemPrompt }
          : {}),
        tools: anthropicTools,
        tool_choice: { type: "auto" },
        messages,
        ...(opts.config.temperature != null
          ? { temperature: opts.config.temperature }
          : {}),
      });

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
          code: "claude_mcp_stream",
          message: `Claude MCP stream fout: ${err instanceof Error ? err.message : String(err)}`,
        };
        return;
      }

      const finalMsg = await stream.finalMessage();
      totalInputTokens += finalMsg.usage.input_tokens;
      totalOutputTokens += finalMsg.usage.output_tokens;

      yield {
        type: "cost_update",
        cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      };

      const toolUseBlocks = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
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

      messages.push({ role: "assistant", content: finalMsg.content });

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

      messages.push({ role: "user", content: toolResults });
      yield { type: "message_start", message_id: randomUUID(), role: "assistant" };
      void turnText;
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
