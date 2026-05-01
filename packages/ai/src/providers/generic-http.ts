// Generic HTTP relay used by openclaw + hermes-agent (Jeremy's own services
// running on the VPS). Expects an OpenAI-compatible streaming endpoint at
// agent.config.endpoint. If the user's services use a different shape we'll
// add per-provider mappers next to this file.

import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";

export async function* streamGenericHttp(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const endpoint = opts.config.endpoint;
  if (!endpoint) {
    yield {
      type: "error",
      code: "missing_endpoint",
      message: `Provider "${opts.provider}" has no endpoint configured.`,
    };
    return;
  }

  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  let response: Response;
  try {
    const messages = opts.config.systemPrompt
      ? [{ role: "system", content: opts.config.systemPrompt }, ...opts.messages]
      : opts.messages;
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.config.headers ?? {}),
      },
      body: JSON.stringify({
        model: opts.config.model,
        stream: true,
        messages,
        temperature: opts.config.temperature,
        max_tokens: opts.config.maxTokens,
      }),
    });
  } catch (err) {
    yield {
      type: "error",
      code: "http_network",
      message: err instanceof Error ? err.message : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield {
      type: "error",
      code: `http_${response.status}`,
      message: await response.text().catch(() => response.statusText),
    };
    return;
  }

  const decoder = new TextDecoder();
  let buf = "";
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
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield { type: "token", message_id: messageId, delta };
      } catch {
        // ignore
      }
    }
  }

  yield {
    type: "message_end",
    message_id: messageId,
    usage: { input_tokens: 0, output_tokens: 0, cost_cents: 0 },
  };
}
