import "server-only";

import { createHash } from "node:crypto";

import type { ChatMessage } from "@aio/ai/ag-ui";
import {
  streamChat,
  type AgentConfig,
  type ProviderId,
} from "@aio/ai/router";

import { resolveApiKey } from "../api-keys/resolve";
import { resolveOllamaEndpoint } from "../ollama/endpoint";
import { getServiceRoleSupabase } from "../supabase/service";
import { LOCALES, type Locale } from "./dict";

type ContentTranslationInput = {
  sourceKind: string;
  sourceId: string;
  field: string;
  text: string | null | undefined;
};

type TranslateOptions = {
  credentialOwnerUserId?: string | null;
  businessId?: string | null;
  navNodeId?: string | null;
};

type TranslationRow = {
  source_hash: string;
  translated_text: string;
};

type TranslationProvider = {
  provider: ProviderId;
  apiKey: string | null;
  model?: string;
  ollamaEndpoint?: string | null;
};

const TARGET_LANGUAGE: Record<Locale, string> = {
  nl: "Dutch",
  en: "English",
  de: "German",
};

const PROVIDER_PRIORITY: ProviderId[] = [
  "minimax",
  "openrouter",
  "claude",
  "ollama",
];

const PROVIDER_KEY: Partial<Record<ProviderId, string>> = {
  minimax: "minimax",
  openrouter: "openrouter",
  claude: "claude",
};

const DEFAULT_MODEL: Partial<Record<ProviderId, string>> = {
  minimax: "MiniMax-M2.7-Highspeed",
  openrouter: "openrouter/auto",
  claude: "claude-sonnet-4-6",
  ollama: process.env.AIO_TRANSLATION_OLLAMA_MODEL ?? "llama3",
};

export async function translateContentBatch(
  workspaceId: string,
  locale: Locale,
  inputs: ContentTranslationInput[],
  opts: TranslateOptions = {},
): Promise<string[]> {
  if (!LOCALES.includes(locale)) {
    return inputs.map((item) => item.text ?? "");
  }

  const normalized = inputs.map((item) => {
    const text = item.text ?? "";
    return {
      ...item,
      text,
      hash: hashText(text),
      translatable: shouldTranslateText(text),
    };
  });

  const result = normalized.map((item) => item.text);
  const translatable = normalized.filter((item) => item.translatable);
  if (translatable.length === 0) return result;

  let supabase: ReturnType<typeof getServiceRoleSupabase>;
  try {
    supabase = getServiceRoleSupabase();
  } catch (err) {
    console.error("content translation cache unavailable", err);
    return result;
  }
  const hashes = [...new Set(translatable.map((item) => item.hash))];
  const { data: cached, error } = await supabase
    .from("content_translations")
    .select("source_hash, translated_text")
    .eq("workspace_id", workspaceId)
    .eq("locale", locale)
    .in("source_hash", hashes);

  if (error) {
    console.error("content translation cache read failed", error);
  }

  const cachedByHash = new Map(
    ((cached ?? []) as TranslationRow[]).map((row) => [
      row.source_hash,
      row.translated_text,
    ]),
  );

  normalized.forEach((item, index) => {
    const cachedText = cachedByHash.get(item.hash);
    if (cachedText) result[index] = cachedText;
  });

  const missing = translatable.filter((item) => !cachedByHash.has(item.hash));
  if (missing.length === 0) return result;

  const provider = await resolveTranslationProvider(workspaceId, opts);
  if (!provider) return result;

  const translatedByHash = await translateMissing(
    workspaceId,
    locale,
    provider,
    missing,
  );
  if (translatedByHash.size === 0) return result;

  const rows = missing
    .map((item) => {
      const translated = translatedByHash.get(item.hash);
      if (!translated) return null;
      return {
        workspace_id: workspaceId,
        locale,
        source_hash: item.hash,
        source_kind: item.sourceKind,
        source_id: item.sourceId,
        source_field: item.field,
        source_text: item.text,
        translated_text: translated,
        provider: provider.provider,
        model: provider.model ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  if (rows.length > 0) {
    const { error: writeError } = await supabase
      .from("content_translations")
      .upsert(rows, {
        onConflict: "workspace_id,locale,source_hash",
      });
    if (writeError) {
      console.error("content translation cache write failed", writeError);
    }
  }

  normalized.forEach((item, index) => {
    const translated = translatedByHash.get(item.hash);
    if (translated) result[index] = translated;
  });

  return result;
}

export async function translateBusinessRows<
  T extends {
    id: string;
    name: string;
    sub?: string | null;
    primary_action?: string | null;
    description?: string | null;
    mission?: string | null;
    targets?: Array<{
      id?: string;
      name?: string;
      target?: string;
      current?: string;
      notes?: string;
    }>;
  },
>(
  workspaceId: string,
  locale: Locale,
  rows: T[],
  opts: TranslateOptions = {},
): Promise<T[]> {
  const items: ContentTranslationInput[] = [];
  const setters: Array<(value: string) => void> = [];
  const copies = rows.map((row) => ({
    ...row,
    targets: row.targets?.map((target) => ({ ...target })),
  }));

  for (const row of copies) {
    addField(items, setters, "business", row.id, "name", row.name, (value) => {
      row.name = value;
    });
    addField(items, setters, "business", row.id, "sub", row.sub, (value) => {
      row.sub = value;
    });
    addField(
      items,
      setters,
      "business",
      row.id,
      "primary_action",
      row.primary_action,
      (value) => {
        row.primary_action = value;
      },
    );
    addField(
      items,
      setters,
      "business",
      row.id,
      "description",
      row.description,
      (value) => {
        row.description = value;
      },
    );
    addField(
      items,
      setters,
      "business",
      row.id,
      "mission",
      row.mission,
      (value) => {
        row.mission = value;
      },
    );

    row.targets?.forEach((target, index) => {
      const targetId = `${row.id}:target:${target.id ?? index}`;
      addField(
        items,
        setters,
        "business_target",
        targetId,
        "name",
        target.name,
        (value) => {
          target.name = value;
        },
      );
      addField(
        items,
        setters,
        "business_target",
        targetId,
        "target",
        target.target,
        (value) => {
          target.target = value;
        },
      );
      addField(
        items,
        setters,
        "business_target",
        targetId,
        "current",
        target.current,
        (value) => {
          target.current = value;
        },
      );
      addField(
        items,
        setters,
        "business_target",
        targetId,
        "notes",
        target.notes,
        (value) => {
          target.notes = value;
        },
      );
    });
  }

  await applyTranslations(workspaceId, locale, items, setters, opts);
  return copies as T[];
}

export async function translateQueueRows<
  T extends { id: string; title: string; meta?: string | null },
>(
  workspaceId: string,
  locale: Locale,
  rows: T[],
  opts: TranslateOptions = {},
): Promise<T[]> {
  const copies = rows.map((row) => ({ ...row }));
  const items: ContentTranslationInput[] = [];
  const setters: Array<(value: string) => void> = [];

  for (const row of copies) {
    addField(items, setters, "queue_item", row.id, "title", row.title, (value) => {
      row.title = value;
    });
    addField(items, setters, "queue_item", row.id, "meta", row.meta, (value) => {
      row.meta = value;
    });
  }

  await applyTranslations(workspaceId, locale, items, setters, opts);
  return copies;
}

export async function translateAgentRows<T extends { id: string; name: string }>(
  workspaceId: string,
  locale: Locale,
  rows: T[],
  opts: TranslateOptions = {},
): Promise<T[]> {
  const copies = rows.map((row) => ({ ...row }));
  const items: ContentTranslationInput[] = [];
  const setters: Array<(value: string) => void> = [];

  for (const row of copies) {
    addField(items, setters, "agent", row.id, "name", row.name, (value) => {
      row.name = value;
    });
  }

  await applyTranslations(workspaceId, locale, items, setters, opts);
  return copies;
}

export async function translateNavNodeRows<
  T extends { id: string; name: string; sub?: string | null },
>(
  workspaceId: string,
  locale: Locale,
  rows: T[],
  opts: TranslateOptions = {},
): Promise<T[]> {
  const copies = rows.map((row) => ({ ...row }));
  const items: ContentTranslationInput[] = [];
  const setters: Array<(value: string) => void> = [];

  for (const row of copies) {
    addField(items, setters, "nav_node", row.id, "name", row.name, (value) => {
      row.name = value;
    });
    addField(items, setters, "nav_node", row.id, "sub", row.sub, (value) => {
      row.sub = value;
    });
  }

  await applyTranslations(workspaceId, locale, items, setters, opts);
  return copies;
}

async function applyTranslations(
  workspaceId: string,
  locale: Locale,
  items: ContentTranslationInput[],
  setters: Array<(value: string) => void>,
  opts: TranslateOptions,
) {
  if (items.length === 0) return;
  const translated = await translateContentBatch(workspaceId, locale, items, opts);
  translated.forEach((value, index) => setters[index]?.(value));
}

function addField(
  items: ContentTranslationInput[],
  setters: Array<(value: string) => void>,
  sourceKind: string,
  sourceId: string,
  field: string,
  text: string | null | undefined,
  setter: (value: string) => void,
) {
  if (text == null) return;
  items.push({ sourceKind, sourceId, field, text });
  setters.push(setter);
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function shouldTranslateText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 12_000) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(trimmed)) return false;
  if (/^[0-9\s.,:%€$+\-/]+$/.test(trimmed)) return false;
  if (/^[A-Z0-9_]{6,}$/.test(trimmed)) return false;
  if (/^[{[]/.test(trimmed)) return false;
  return /[A-Za-zÀ-ÿ]/.test(trimmed);
}

async function resolveTranslationProvider(
  workspaceId: string,
  opts: TranslateOptions,
): Promise<TranslationProvider | null> {
  const configured = process.env.AIO_TRANSLATION_PROVIDER as ProviderId | undefined;
  const providers = configured
    ? [configured, ...PROVIDER_PRIORITY.filter((p) => p !== configured)]
    : PROVIDER_PRIORITY;

  for (const provider of providers) {
    if (provider === "ollama") {
      const endpoint = await resolveOllamaEndpoint(workspaceId);
      if (!endpoint && !process.env.OLLAMA_BASE_URL) continue;
      return {
        provider,
        apiKey: null,
        model: process.env.AIO_TRANSLATION_MODEL ?? DEFAULT_MODEL[provider],
        ollamaEndpoint: endpoint,
      };
    }

    const keyProvider = PROVIDER_KEY[provider];
    if (!keyProvider) continue;
    const apiKey = await resolveApiKey(keyProvider, {
      workspaceId,
      businessId: opts.businessId,
      navNodeId: opts.navNodeId,
      credentialOwnerUserId: opts.credentialOwnerUserId ?? null,
    });
    if (apiKey) {
      return {
        provider,
        apiKey,
        model: process.env.AIO_TRANSLATION_MODEL ?? DEFAULT_MODEL[provider],
      };
    }
  }

  return null;
}

async function translateMissing(
  workspaceId: string,
  locale: Locale,
  provider: TranslationProvider,
  missing: Array<ContentTranslationInput & { hash: string; text: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = dedupeByHash(missing);

  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    const translated = await translateChunk(workspaceId, locale, provider, chunk);
    translated.forEach((value, key) => out.set(key, value));
  }

  return out;
}

async function translateChunk(
  workspaceId: string,
  locale: Locale,
  provider: TranslationProvider,
  chunk: Array<ContentTranslationInput & { hash: string; text: string }>,
): Promise<Map<string, string>> {
  const payload = Object.fromEntries(
    chunk.map((item) => [
      item.hash,
      {
        kind: item.sourceKind,
        field: item.field,
        text: item.text,
      },
    ]),
  );
  const config: AgentConfig = {
    model: provider.model,
    temperature: 0,
    maxTokens: Math.min(
      8192,
      Math.max(1024, JSON.stringify(payload).length * 2),
    ),
    systemPrompt:
      `You translate application content to ${TARGET_LANGUAGE[locale]}. ` +
      "Return only a JSON object whose keys are the input hashes and whose values are translated strings. " +
      "Preserve markdown, code blocks, URLs, email addresses, IDs, JSON, cron expressions, placeholders like {name}, currency amounts, and brand/product names. " +
      "If text is already in the target language, return it unchanged. Do not explain.",
  };
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: JSON.stringify(payload),
    },
  ];

  let text = "";
  try {
    for await (const event of streamChat({
      provider: provider.provider,
      config,
      messages,
      apiKey: provider.apiKey,
      tenant: {
        workspaceId,
        ollamaEndpoint: provider.ollamaEndpoint,
      },
    })) {
      if (event.type === "token") text += event.delta;
      if (event.type === "error") {
        console.error("content translation provider error", event);
        return new Map();
      }
    }
  } catch (err) {
    console.error("content translation failed", err);
    return new Map();
  }

  const parsed = parseJsonObject(text);
  const out = new Map<string, string>();
  for (const item of chunk) {
    const value = parsed[item.hash];
    if (typeof value === "string" && value.trim()) {
      out.set(item.hash, value);
    }
  }
  return out;
}

function dedupeByHash<T extends { hash: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.hash)) continue;
    seen.add(item.hash);
    out.push(item);
  }
  return out;
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return {};
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
