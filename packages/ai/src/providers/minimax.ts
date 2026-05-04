// MiniMax provider — direct HTTP path against MiniMax's
// OpenAI-compatible chat completions endpoint. Multiple bases:
//
//   https://api.minimax.io/v1/text/chatcompletion_v2     (Coder Plan,
//                                                        models like
//                                                        MiniMax-M2.7-Highspeed)
//   https://api.minimaxi.com/v1/text/chatcompletion_v2   (international
//                                                        platform key)
//   https://api.minimax.chat/v1/text/chatcompletion_v2   (China region)
//
// Set MINIMAX_BASE_URL in env (or per-agent via config.endpoint) to
// point at the right base. Default is the Coder Plan endpoint since
// that's what most users have. Different bases expose different model
// names — we don't validate against a hard list, just hand the
// MiniMax error back when it complains.

import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const DEFAULT_BASE = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M2.7-Highspeed";

export async function* streamMinimax(
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

  let response: Response;
  try {
    const messages = opts.config.systemPrompt
      ? [{ role: "system", content: opts.config.systemPrompt }, ...opts.messages]
      : opts.messages;
    response = await fetch(`${base}/text/chatcompletion_v2`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
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
      code: "minimax_network",
      message: err instanceof Error ? err.message : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield {
      type: "error",
      code: `minimax_${response.status}`,
      message: await response.text().catch(() => response.statusText),
    };
    return;
  }

  // MiniMax returns HTTP 200 + a JSON envelope when the key is missing
  // or invalid. Detect that BEFORE we start reading SSE chunks so the
  // user gets a real error instead of an empty assistant message.
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
    // Specific hint for the most common confusion: Coder Plan keys
    // don't authenticate against the platform chat-completion API.
    if (
      /invalid api key|invalid_api_key|login fail|unauthorized|401/i.test(msg)
    ) {
      msg +=
        "\n\nLet op: een MiniMax Coder Plan key werkt NIET voor direct chat. " +
        "Voor /v1/text/chatcompletion_v2 heb je een aparte platform key nodig " +
        "van https://platform.minimaxi.com (Group ID + API Key). " +
        "De Coder Plan key is alleen voor MiniMax MCP via Claude Code.";
    }
    yield {
      type: "error",
      code: "minimax_invalid_response",
      message: `MiniMax: ${msg}`,
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
        if (delta) yield { type: "token", message_id: messageId, delta };
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens ?? inputTokens;
          outputTokens = json.usage.completion_tokens ?? outputTokens;
        }
      } catch {
        // tolerate keep-alives / malformed lines
      }
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
