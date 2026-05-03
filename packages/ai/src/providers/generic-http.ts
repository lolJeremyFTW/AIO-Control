// Generic HTTP relay used by openclaw + hermes-agent (Jeremy's own
// services running on the VPS) — and any future custom OpenAI-shape
// chat completions endpoint.
//
// Endpoint resolution order:
//   1. agent.config.endpoint                         (per-agent override)
//   2. process.env[`${PROVIDER}_URL`]                (env default — set
//      OPENCLAW_URL / HERMES_URL on the VPS once)
//   3. error
//
// Auth header resolution order (per request):
//   1. agent.config.headers                          (per-agent literal)
//   2. opts.apiKey via "Authorization: Bearer …"     (tiered API key)
//   3. process.env[`${PROVIDER}_API_KEY`]            (env fallback)
//   4. no auth header

import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";

export async function* streamGenericHttp(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const provider = opts.provider.toUpperCase();
  const endpoint =
    opts.config.endpoint ?? process.env[`${provider}_URL`];
  if (!endpoint) {
    yield {
      type: "error",
      code: "missing_endpoint",
      message:
        `Provider "${opts.provider}" heeft geen endpoint. ` +
        `Zet \`${provider}_URL\` in env (bv. http://127.0.0.1:8001/v1/chat/completions) ` +
        `of vul agent.config.endpoint in.`,
    };
    return;
  }

  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts.config.headers ?? {}),
  };
  const envKey = process.env[`${provider}_API_KEY`];
  const bearer = opts.apiKey || envKey;
  if (bearer && !headers["authorization"] && !headers["Authorization"]) {
    headers["authorization"] = `Bearer ${bearer}`;
  }

  let response: Response;
  try {
    const messages = opts.config.systemPrompt
      ? [{ role: "system", content: opts.config.systemPrompt }, ...opts.messages]
      : opts.messages;
    response = await fetch(endpoint, {
      method: "POST",
      headers,
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
      message:
        err instanceof Error
          ? `${err.message} (kan ${endpoint} bereiken? Check of de service draait.)`
          : "Network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => response.statusText);
    yield {
      type: "error",
      code: `http_${response.status}`,
      message: `${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
    };
    return;
  }

  // Some self-hosted services return non-streaming JSON even when
  // stream=true is requested. Detect that and handle as one-shot.
  const ctype = response.headers.get("content-type") ?? "";
  if (ctype.includes("application/json") && !ctype.includes("event-stream")) {
    const json = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const text = json?.choices?.[0]?.message?.content ?? "";
    if (text) yield { type: "token", message_id: messageId, delta: text };
    yield {
      type: "message_end",
      message_id: messageId,
      usage: { input_tokens: 0, output_tokens: 0, cost_cents: 0 },
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
