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
import type { StreamChatOptions } from "../router";

export async function* streamOllama(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const base =
    opts.config.endpoint ??
    opts.tenant?.ollamaEndpoint ??
    process.env.OLLAMA_BASE_URL ??
    "http://localhost:11434";
  const model = opts.config.model ?? "llama3";
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
