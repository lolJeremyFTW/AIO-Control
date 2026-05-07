import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";

const DEFAULT_CODEX_ENDPOINT =
  "https://chatgpt.com/backend-api/codex/responses";

export async function* streamOpenAICodex(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const accessToken = opts.apiKey;
  if (!accessToken) {
    yield {
      type: "error",
      code: "missing_codex_login",
      message:
        "Geen ChatGPT/Codex login gevonden voor deze gebruiker. Verbind OpenAI Codex via Settings -> Providers.",
    };
    return;
  }

  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const endpoint =
    opts.config.endpoint ??
    process.env.OPENAI_CODEX_RESPONSES_URL ??
    DEFAULT_CODEX_ENDPOINT;
  const model = normalizeCodexModel(
    opts.config.model ?? process.env.OPENAI_CODEX_DEFAULT_MODEL ?? "gpt-5.5",
  );

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream, application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        input: buildInput(opts),
        temperature: opts.config.temperature,
        max_output_tokens: opts.config.maxTokens,
      }),
    });
  } catch (err) {
    yield {
      type: "error",
      code: "codex_network",
      message: err instanceof Error ? err.message : "Codex network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => response.statusText);
    yield {
      type: "error",
      code: `codex_${response.status}`,
      message: friendlyCodexError(response.status, body),
    };
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  let outputTokens = 0;
  let inputTokens = 0;

  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as unknown;
    const text = extractText(json);
    if (text) {
      outputTokens = Math.max(1, Math.ceil(text.length / 4));
      yield { type: "token", message_id: messageId, delta: text };
    }
  } else {
    for await (const ev of parseSse(response.body)) {
      if (ev === "[DONE]") continue;
      let json: unknown;
      try {
        json = JSON.parse(ev) as unknown;
      } catch {
        continue;
      }
      const delta = extractDelta(json);
      if (delta) {
        outputTokens += Math.max(1, Math.ceil(delta.length / 4));
        yield { type: "token", message_id: messageId, delta };
      }
      const usage = extractUsage(json);
      if (usage) {
        inputTokens = usage.inputTokens ?? inputTokens;
        outputTokens = usage.outputTokens ?? outputTokens;
      }
    }
  }

  yield {
    type: "message_end",
    message_id: messageId,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: 0,
    },
  };
}

function normalizeCodexModel(model: string): string {
  return model.replace(/^openai_codex\//, "").replace(/^openai-codex\//, "");
}

function buildInput(opts: StreamChatOptions): unknown[] {
  const out: unknown[] = [];
  if (opts.config.systemPrompt) {
    out.push({
      role: "system",
      content: [{ type: "input_text", text: opts.config.systemPrompt }],
    });
  }
  for (const m of opts.messages) {
    out.push({
      role: m.role,
      content: [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }],
    });
  }
  return out;
}

async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = frame
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("data:"));
      if (lines.length === 0) continue;
      yield lines.map((l) => l.slice(5).trim()).join("\n");
    }
  }
}

function extractDelta(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const obj = json as Record<string, unknown>;
  for (const key of ["delta", "text", "content"]) {
    const v = obj[key];
    if (typeof v === "string") return v;
  }
  const type = typeof obj.type === "string" ? obj.type : "";
  if (
    type.includes("output_text.delta") ||
    type.includes("response.output_text.delta")
  ) {
    const delta = obj.delta;
    return typeof delta === "string" ? delta : "";
  }
  return extractText(obj);
}

function extractText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const obj = json as Record<string, unknown>;
  const outputText = obj.output_text;
  if (typeof outputText === "string") return outputText;
  const choices = obj.choices;
  if (Array.isArray(choices)) {
    return choices
      .map((c) => {
        const choice = c as Record<string, unknown>;
        const message = choice.message as Record<string, unknown> | undefined;
        const delta = choice.delta as Record<string, unknown> | undefined;
        return (
          (typeof message?.content === "string" && message.content) ||
          (typeof delta?.content === "string" && delta.content) ||
          ""
        );
      })
      .join("");
  }
  const output = obj.output;
  if (Array.isArray(output)) {
    return output.map(extractText).join("");
  }
  const content = obj.content;
  if (Array.isArray(content)) {
    return content.map(extractText).join("");
  }
  if (typeof obj.text === "string") return obj.text;
  return "";
}

function extractUsage(
  json: unknown,
): { inputTokens?: number; outputTokens?: number } | null {
  if (!json || typeof json !== "object") return null;
  const usage = (json as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  return {
    inputTokens:
      typeof u.input_tokens === "number"
        ? u.input_tokens
        : typeof u.prompt_tokens === "number"
          ? u.prompt_tokens
          : undefined,
    outputTokens:
      typeof u.output_tokens === "number"
        ? u.output_tokens
        : typeof u.completion_tokens === "number"
          ? u.completion_tokens
          : undefined,
  };
}

function friendlyCodexError(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "ChatGPT/Codex login is verlopen of heeft geen toegang. Verbind OpenAI Codex opnieuw via Settings -> Providers.";
  }
  if (status === 429 || /rate|quota|overloaded/i.test(body)) {
    return "Je ChatGPT/Codex subscription quota of rate-limit is bereikt. Probeer later opnieuw of gebruik tijdelijk een API-key provider.";
  }
  if (/image/i.test(body) && /not|unsupported|capab/i.test(body)) {
    return "Image generation requires OpenAI API key fallback.";
  }
  return body.length > 700 ? body.slice(0, 700) + "..." : body;
}
