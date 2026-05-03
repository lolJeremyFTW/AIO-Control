// Claude provider — streams via the Anthropic SDK. We don't hand-roll the
// Messages API call; the SDK handles SSE chunking + retries + version
// headers for us.
//
// Tool-use: when the caller passes opts.tools, we surface them to
// Claude as Anthropic Tool[] objects. Tool_use blocks come back as
// AG-UI tool_call_start events. The chat-route is responsible for
// executing the tool and re-invoking us with a tool_result message.

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";

import type { AGUIEvent, ChatMessage } from "../ag-ui";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const DEFAULT_MODEL = "claude-sonnet-4-6";

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
