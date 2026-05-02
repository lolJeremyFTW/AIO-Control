// Claude provider — streams via the Anthropic SDK. We don't hand-roll the
// Messages API call; the SDK handles SSE chunking + retries + version
// headers for us.
//
// MCP integration: when the agent config lists mcp_servers, those would be
// loaded by Claude Code (subprocess) instead of the SDK directly. Phase 4
// wires the Claude-Code subprocess flow; for chat we use the SDK path which
// supports tool_use / tool_result natively.

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const DEFAULT_MODEL = "claude-sonnet-4-6";

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
      .filter((m): m is { role: "user" | "assistant"; content: string } =>
        m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role, content: m.content }));

    const stream = await client.messages.stream({
      model,
      max_tokens: opts.config.maxTokens ?? 1024,
      system: opts.config.systemPrompt,
      temperature: opts.config.temperature,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield {
          type: "token",
          message_id: messageId,
          delta: event.delta.text,
        };
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
