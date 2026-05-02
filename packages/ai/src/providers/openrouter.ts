// OpenRouter provider — OpenAI-compatible streaming endpoint covering 100+
// models. We hand-roll the SSE parse because we don't want to pull in the
// full openai SDK just for fetch + chunk handling.

import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_cents: 0 },
  };
}
