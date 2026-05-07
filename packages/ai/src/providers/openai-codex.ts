import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import { McpHost } from "../mcp/host";
import { priceTokens } from "../pricing";
import type { StreamChatOptions } from "../router";

const DEFAULT_CODEX_ENDPOINT =
  "https://chatgpt.com/backend-api/codex/responses";
const ENV_HOPS_MAX = Number(process.env.AGENT_MAX_HOPS ?? "150");

type CodexInputItem = Record<string, unknown>;
type CodexToolCall = {
  id: string;
  callId: string;
  name: string;
  args: unknown;
  argumentsText: string;
  inputItem: CodexInputItem;
};
type CodexToolSlot = {
  id?: string;
  callId?: string;
  name?: string;
  argumentsText: string;
  rawItem?: CodexInputItem;
};
type CodexTurnEvent =
  | { kind: "token"; delta: string }
  | { kind: "error"; code: string; message: string }
  | {
      kind: "done";
      text: string;
      toolCalls: CodexToolCall[];
      outputItems: CodexInputItem[];
      inputTokens: number;
      outputTokens: number;
    };

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

  const mcpServers = opts.config.mcpServers ?? [];
  if (mcpServers.length > 0) {
    yield* streamOpenAICodexWithMcp(opts, accessToken, mcpServers);
    return;
  }

  yield* streamOpenAICodexPlain(opts, accessToken);
}

async function* streamOpenAICodexPlain(
  opts: StreamChatOptions,
  accessToken: string,
): AsyncIterable<AGUIEvent> {
  const messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const endpoint =
    opts.config.endpoint ??
    process.env.OPENAI_CODEX_RESPONSES_URL ??
    DEFAULT_CODEX_ENDPOINT;
  const model = normalizeCodexModel(
    opts.config.model ?? process.env.OPENAI_CODEX_DEFAULT_MODEL ?? "gpt-5.5",
  );

  let outputTokens = 0;
  let inputTokens = 0;
  for await (const ev of streamCodexTurnEvents({
    endpoint,
    accessToken,
    body: buildCodexBody(opts, model, buildInput(opts)),
  })) {
    if (ev.kind === "token") {
      outputTokens += Math.max(1, Math.ceil(ev.delta.length / 4));
      yield { type: "token", message_id: messageId, delta: ev.delta };
    } else if (ev.kind === "error") {
      yield { type: "error", code: ev.code, message: ev.message };
      return;
    } else if (ev.kind === "done") {
      inputTokens = ev.inputTokens;
      outputTokens = ev.outputTokens || outputTokens;
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

async function* streamOpenAICodexWithMcp(
  opts: StreamChatOptions,
  accessToken: string,
  serverIds: string[],
): AsyncIterable<AGUIEvent> {
  const endpoint =
    opts.config.endpoint ??
    process.env.OPENAI_CODEX_RESPONSES_URL ??
    DEFAULT_CODEX_ENDPOINT;
  const model = normalizeCodexModel(
    opts.config.model ?? process.env.OPENAI_CODEX_DEFAULT_MODEL ?? "gpt-5.5",
  );

  let messageId = randomUUID();
  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const host = new McpHost();
  try {
    try {
      const permissions =
        (opts.config.mcpPermissions as
          | { filesystem?: "off" | "ro" | "rw"; aio?: "off" | "ro" | "rw" }
          | undefined) ?? {};
      await host.connect(
        serverIds,
        buildCodexMcpEnv(opts, accessToken),
        permissions,
      );
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

    const codexTools = mcpTools.map((t) => ({
      type: "function" as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const input = buildInput(opts);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let hop = 0; hop < getHopsMax(opts.config); hop++) {
      let turn: Extract<CodexTurnEvent, { kind: "done" }> | null = null;

      for await (const ev of streamCodexTurnEvents({
        endpoint,
        accessToken,
        body: buildCodexBody(opts, model, input, codexTools),
      })) {
        if (ev.kind === "token") {
          yield { type: "token", message_id: messageId, delta: ev.delta };
        } else if (ev.kind === "error") {
          yield { type: "error", code: ev.code, message: ev.message };
          return;
        } else if (ev.kind === "done") {
          turn = ev;
        }
      }

      if (!turn) {
        yield {
          type: "error",
          code: "codex_empty_turn",
          message: "Codex gaf geen bruikbare response terug.",
        };
        return;
      }

      totalInputTokens += turn.inputTokens;
      totalOutputTokens += turn.outputTokens;

      yield {
        type: "cost_update",
        cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      };

      if (turn.toolCalls.length === 0) {
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

      appendCodexAssistantTurn(input, turn);

      for (const tc of turn.toolCalls) {
        yield {
          type: "tool_call_start",
          tool_call_id: tc.id,
          name: tc.name,
          args: tc.args,
        };
        const result = await host.call(tc.name, tc.args);
        yield {
          type: "tool_call_result",
          tool_call_id: tc.id,
          output: result,
        };
        input.push({
          type: "function_call_output",
          call_id: tc.callId,
          output: result,
        });
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
        cost_cents: priceTokens(model, totalInputTokens, totalOutputTokens),
      },
    };
  } finally {
    await host.close();
  }
}

function getHopsMax(config: { maxHops?: number }): number {
  return config.maxHops && config.maxHops > 0 ? config.maxHops : ENV_HOPS_MAX;
}

function buildCodexBody(
  opts: StreamChatOptions,
  model: string,
  input: unknown[],
  tools?: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    model,
    stream: true,
    input,
    temperature: opts.config.temperature,
    max_output_tokens: opts.config.maxTokens,
    ...(tools && tools.length > 0
      ? { tools, tool_choice: "auto", parallel_tool_calls: true }
      : {}),
  };
}

function buildCodexMcpEnv(
  opts: StreamChatOptions,
  accessToken: string,
): Record<string, string> {
  const env: Record<string, string> = {
    ...(opts.tenant?.mcpToolKeys ?? {}),
    OPENAI_CODEX_ACCESS_TOKEN: accessToken,
  };

  if (opts.tenant?.workspaceId) {
    env.AIO_WORKSPACE_ID = opts.tenant.workspaceId;
  }
  if (opts.tenant && "businessId" in opts.tenant) {
    env.AIO_BUSINESS_ID = opts.tenant.businessId ?? "";
  }
  if (opts.tenant && "navNodeId" in opts.tenant) {
    env.AIO_NAV_NODE_ID = opts.tenant.navNodeId ?? "";
  }

  return env;
}

async function* streamCodexTurnEvents(args: {
  endpoint: string;
  accessToken: string;
  body: Record<string, unknown>;
}): AsyncGenerator<CodexTurnEvent> {
  let response: Response;
  try {
    response = await fetch(args.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream, application/json",
        authorization: `Bearer ${args.accessToken}`,
      },
      body: JSON.stringify(args.body),
    });
  } catch (err) {
    yield {
      kind: "error",
      code: "codex_network",
      message: err instanceof Error ? err.message : "Codex network error",
    };
    return;
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => response.statusText);
    yield {
      kind: "error",
      code: `codex_${response.status}`,
      message: friendlyCodexError(response.status, body),
    };
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as unknown;
    const text = extractText(json);
    const usage = extractUsage(json);
    const outputItems = extractResponseOutputItems(json);
    if (text) yield { kind: "token", delta: text };
    yield {
      kind: "done",
      text,
      toolCalls: collectToolCallsFromItems(outputItems),
      outputItems,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens:
        usage?.outputTokens ??
        (text ? Math.max(1, Math.ceil(text.length / 4)) : 0),
    };
    return;
  }

  const slots = new Map<string, CodexToolSlot>();
  const doneItems: CodexInputItem[] = [];
  let finalOutputItems: CodexInputItem[] | null = null;
  let turnText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const ev of parseSse(response.body)) {
    if (ev === "[DONE]") continue;
    let json: unknown;
    try {
      json = JSON.parse(ev) as unknown;
    } catch {
      continue;
    }

    ingestStreamingToolCalls(json, slots);

    const doneItem = extractDoneOutputItem(json);
    if (doneItem) doneItems.push(doneItem);

    const completedItems = extractCompletedOutputItems(json);
    if (completedItems.length > 0) {
      finalOutputItems = completedItems;
    }

    const delta = extractStreamingTextDelta(json);
    if (delta) {
      turnText += delta;
      yield { kind: "token", delta };
    }

    const usage = extractUsage(json);
    if (usage) {
      inputTokens = usage.inputTokens ?? inputTokens;
      outputTokens = usage.outputTokens ?? outputTokens;
    }
  }

  const outputItems = dedupeOutputItems(finalOutputItems ?? doneItems);
  const callsFromItems = collectToolCallsFromItems(outputItems);
  const callsFromSlots = collectToolCallsFromSlots(slots);

  yield {
    kind: "done",
    text: turnText,
    toolCalls: mergeToolCalls(callsFromItems, callsFromSlots),
    outputItems,
    inputTokens,
    outputTokens:
      outputTokens || (turnText ? Math.max(1, Math.ceil(turnText.length / 4)) : 0),
  };
}

function appendCodexAssistantTurn(
  input: unknown[],
  turn: Extract<CodexTurnEvent, { kind: "done" }>,
): void {
  const appendedCallIds = new Set<string>();
  let appendedText = false;

  for (const item of turn.outputItems) {
    input.push(item);
    if (isFunctionCallItem(item)) {
      const callId = stringValue(item.call_id) || stringValue(item.id);
      if (callId) appendedCallIds.add(callId);
    }
    if (isMessageTextItem(item)) appendedText = true;
  }

  if (turn.text.trim() && !appendedText) {
    input.push({
      role: "assistant",
      content: [{ type: "output_text", text: turn.text }],
    });
  }

  for (const tc of turn.toolCalls) {
    if (!appendedCallIds.has(tc.callId)) {
      input.push(tc.inputItem);
    }
  }
}

function ingestStreamingToolCalls(
  json: unknown,
  slots: Map<string, CodexToolSlot>,
): void {
  const obj = asRecord(json);
  if (!obj) return;

  const type = stringValue(obj.type);
  const item = asRecord(obj.item);
  if (item && isFunctionCallItem(item)) {
    const key = toolSlotKey(obj, item);
    updateToolSlot(slots, key, {
      id: stringValue(item.id),
      callId: stringValue(item.call_id) || stringValue(item.id),
      name: stringValue(item.name),
      argumentsText: stringValue(item.arguments),
      rawItem: item,
      replaceArguments: true,
    });
  }

  if (/function_call_arguments\.delta/i.test(type)) {
    updateToolSlot(slots, toolSlotKey(obj), {
      argumentsText: stringValue(obj.delta),
      appendArguments: true,
    });
  }

  if (/function_call_arguments\.done/i.test(type)) {
    updateToolSlot(slots, toolSlotKey(obj), {
      argumentsText: stringValue(obj.arguments),
      replaceArguments: true,
    });
  }

  const choices = obj.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const c = asRecord(choice);
      if (!c) continue;
      ingestChatCompletionToolCalls(asRecord(c.delta), slots, true);
      ingestChatCompletionToolCalls(asRecord(c.message), slots, false);
    }
  }
}

function ingestChatCompletionToolCalls(
  carrier: Record<string, unknown> | null,
  slots: Map<string, CodexToolSlot>,
  appendArguments: boolean,
): void {
  const toolCalls = carrier?.tool_calls;
  if (!Array.isArray(toolCalls)) return;

  toolCalls.forEach((raw, fallbackIndex) => {
    const tc = asRecord(raw);
    if (!tc) return;
    const fn = asRecord(tc.function);
    const index = typeof tc.index === "number" ? tc.index : fallbackIndex;
    updateToolSlot(slots, `chat:${index}`, {
      id: stringValue(tc.id),
      callId: stringValue(tc.id),
      name: stringValue(fn?.name),
      argumentsText: stringValue(fn?.arguments),
      appendArguments,
      replaceArguments: !appendArguments,
    });
  });
}

function updateToolSlot(
  slots: Map<string, CodexToolSlot>,
  key: string,
  patch: {
    id?: string;
    callId?: string;
    name?: string;
    argumentsText?: string;
    rawItem?: CodexInputItem;
    appendArguments?: boolean;
    replaceArguments?: boolean;
  },
): void {
  const slot = slots.get(key) ?? { argumentsText: "" };
  if (patch.id) slot.id = patch.id;
  if (patch.callId) slot.callId = patch.callId;
  if (patch.name) slot.name = patch.name;
  if (patch.rawItem) slot.rawItem = patch.rawItem;
  if (patch.argumentsText) {
    if (patch.appendArguments) {
      slot.argumentsText += patch.argumentsText;
    } else if (patch.replaceArguments) {
      slot.argumentsText = patch.argumentsText;
    }
  }
  slots.set(key, slot);
}

function toolSlotKey(
  event: Record<string, unknown>,
  item?: Record<string, unknown>,
): string {
  return (
    stringValue(item?.id) ||
    stringValue(item?.call_id) ||
    stringValue(event.item_id) ||
    stringValue(event.call_id) ||
    (typeof event.output_index === "number"
      ? `output:${event.output_index}`
      : "output:0")
  );
}

function collectToolCallsFromItems(items: CodexInputItem[]): CodexToolCall[] {
  return items
    .map((item, index) => toolCallFromItem(item, index))
    .filter((tc): tc is CodexToolCall => !!tc);
}

function collectToolCallsFromSlots(
  slots: Map<string, CodexToolSlot>,
): CodexToolCall[] {
  const out: CodexToolCall[] = [];
  for (const [key, slot] of slots) {
    if (!slot.name) continue;
    const callId =
      slot.callId || slot.id || `call_${key.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const inputItem =
      slot.rawItem && isFunctionCallItem(slot.rawItem)
        ? slot.rawItem
        : {
            type: "function_call",
            call_id: callId,
            name: slot.name,
            arguments: slot.argumentsText,
          };
    out.push({
      id: callId,
      callId,
      name: slot.name,
      args: parseArgs(slot.argumentsText),
      argumentsText: slot.argumentsText,
      inputItem,
    });
  }
  return out;
}

function toolCallFromItem(
  item: CodexInputItem,
  index: number,
): CodexToolCall | null {
  if (!isFunctionCallItem(item)) return null;
  const fn = asRecord(item.function);
  const name = stringValue(item.name) || stringValue(fn?.name);
  if (!name) return null;
  const argumentsText =
    stringValue(item.arguments) || stringValue(fn?.arguments);
  const callId =
    stringValue(item.call_id) || stringValue(item.id) || `call_${index}`;
  return {
    id: callId,
    callId,
    name,
    args: parseArgs(argumentsText),
    argumentsText,
    inputItem: item,
  };
}

function mergeToolCalls(
  primary: CodexToolCall[],
  fallback: CodexToolCall[],
): CodexToolCall[] {
  const seen = new Set<string>();
  const out: CodexToolCall[] = [];
  for (const tc of [...primary, ...fallback]) {
    const key = tc.callId || tc.id || tc.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tc);
  }
  return out;
}

function parseArgs(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text };
  }
}

function isFunctionCallItem(item: Record<string, unknown>): boolean {
  const type = stringValue(item.type);
  return (
    type === "function_call" ||
    type === "tool_call" ||
    (type === "function" && !!stringValue(item.name))
  );
}

function isMessageTextItem(item: Record<string, unknown>): boolean {
  if (stringValue(item.role) === "assistant") return true;
  if (stringValue(item.type) !== "message") return false;
  const content = item.content;
  return Array.isArray(content) && content.some((part) => !!extractText(part));
}

function extractStreamingTextDelta(json: unknown): string {
  const obj = asRecord(json);
  if (!obj) return "";
  const type = stringValue(obj.type);
  if (/function_call|tool_call/i.test(type)) return "";
  if (
    type.includes("output_text.delta") ||
    type.includes("response.output_text.delta")
  ) {
    return stringValue(obj.delta);
  }
  const delta = obj.delta;
  if (typeof delta === "string") return delta;
  const choices = obj.choices;
  if (Array.isArray(choices)) {
    return choices
      .map((choice) => {
        const c = asRecord(choice);
        const d = asRecord(c?.delta);
        return stringValue(d?.content);
      })
      .join("");
  }
  return "";
}

function extractDoneOutputItem(json: unknown): CodexInputItem | null {
  const obj = asRecord(json);
  if (!obj) return null;
  const type = stringValue(obj.type);
  if (!/output_item\.done/i.test(type)) return null;
  const item = asRecord(obj.item);
  return item ? item : null;
}

function extractCompletedOutputItems(json: unknown): CodexInputItem[] {
  const obj = asRecord(json);
  if (!obj) return [];
  const type = stringValue(obj.type);
  if (!/response\.completed/i.test(type)) return [];
  return extractResponseOutputItems(json);
}

function extractResponseOutputItems(json: unknown): CodexInputItem[] {
  const obj = asRecord(json);
  if (!obj) return [];
  const response = asRecord(obj.response);
  const output = Array.isArray(response?.output)
    ? response.output
    : Array.isArray(obj.output)
      ? obj.output
      : [];
  return output.filter((item): item is CodexInputItem => !!asRecord(item));
}

function dedupeOutputItems(items: CodexInputItem[]): CodexInputItem[] {
  const seen = new Set<string>();
  const out: CodexInputItem[] = [];
  for (const item of items) {
    const key =
      stringValue(item.call_id) ||
      stringValue(item.id) ||
      JSON.stringify(item).slice(0, 500);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
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
      content: [
        {
          type: m.role === "assistant" ? "output_text" : "input_text",
          text: m.content,
        },
      ],
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
  const obj = json as Record<string, unknown>;
  const response = asRecord(obj.response);
  const usage = response?.usage ?? obj.usage;
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
