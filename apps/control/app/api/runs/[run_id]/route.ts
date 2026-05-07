// Single-run detail endpoint — returns the full run row including
// message_history (the structured replay captured during dispatch),
// input, output and timing. Used by RunDetailDrawer to render a past
// run chat-style. RLS gates access to workspace members.

import { NextResponse } from "next/server";

import type { RunStep } from "../../../../lib/runs/message-history";
import { translateContentBatch } from "../../../../lib/i18n/content-translations";
import { LOCALES, type Locale } from "../../../../lib/i18n/dict";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type RunDetailForTranslation = {
  id: string;
  workspace_id: string;
  agent_id: string;
  business_id: string | null;
  nav_node_id?: string | null;
  schedule_id: string | null;
  triggered_by: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  cost_cents: number;
  input_tokens: number | null;
  output_tokens: number | null;
  input: unknown;
  output: { text?: string } | null;
  error_text: string | null;
  message_history: RunStep[] | null;
  created_at: string;
  attempt?: number | null;
  max_attempts?: number | null;
  next_retry_at?: string | null;
  agents: {
    id: string;
    name: string;
    provider: string;
    model: string | null;
  } | null;
  schedules: {
    title: string | null;
    kind: string | null;
    cron_expr: string | null;
  } | null;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ run_id: string }> },
) {
  const { run_id } = await ctx.params;
  const locale = normalizeLocale(new URL(req.url).searchParams.get("locale"));
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("runs")
    .select(
      `id, workspace_id, agent_id, business_id, nav_node_id, schedule_id,
       triggered_by, status, started_at, ended_at, duration_ms,
       cost_cents, input_tokens, output_tokens, output,
       error_text, message_history,
       created_at, attempt, max_attempts, next_retry_at,
       agents:agent_id ( id, name, provider, model ),
       schedules:schedule_id ( title, kind, cron_expr )`,
    )
    .eq("id", run_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let input: unknown = null;
  const hasReplay =
    Array.isArray(data.message_history) && data.message_history.length > 0;
  if (!hasReplay) {
    const { data: inputRow, error: inputError } = await supabase
      .from("runs")
      .select("input")
      .eq("id", run_id)
      .maybeSingle();
    if (inputError) {
      return NextResponse.json({ error: inputError.message }, { status: 500 });
    }
    input = inputRow?.input ?? null;
  }

  const row = data as unknown as RunDetailForTranslation & {
    agents:
      | RunDetailForTranslation["agents"]
      | NonNullable<RunDetailForTranslation["agents"]>[];
    schedules:
      | RunDetailForTranslation["schedules"]
      | NonNullable<RunDetailForTranslation["schedules"]>[];
  };
  const run: RunDetailForTranslation = {
    ...row,
    input,
    agents: singleRelation(row.agents),
    schedules: singleRelation(row.schedules),
  };
  const translated = locale
    ? await translateRunDetail(run, locale, user.id)
    : run;

  return NextResponse.json({ run: translated });
}

function normalizeLocale(value: string | null): Locale | null {
  return value && LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function translateRunDetail(
  run: RunDetailForTranslation,
  locale: Locale,
  userId: string,
): Promise<RunDetailForTranslation> {
  const translated: RunDetailForTranslation = {
    ...run,
    agents: run.agents ? { ...run.agents } : null,
    schedules: run.schedules ? { ...run.schedules } : null,
    output: run.output ? { ...run.output } : null,
    message_history: Array.isArray(run.message_history)
      ? run.message_history.map((step) => ({ ...step }) as RunStep)
      : null,
    input: cloneRunInput(run.input),
  };

  const inputs: Array<{
    sourceKind: string;
    sourceId: string;
    field: string;
    text: string;
  }> = [];
  const setters: Array<(value: string) => void> = [];
  const add = (
    sourceKind: string,
    sourceId: string,
    field: string,
    text: string | null | undefined,
    setter: (value: string) => void,
  ) => {
    if (text == null) return;
    inputs.push({ sourceKind, sourceId, field, text });
    setters.push(setter);
  };

  add(
    "agent",
    translated.agent_id,
    "name",
    translated.agents?.name,
    (value) => {
      if (translated.agents) translated.agents.name = value;
    },
  );
  add(
    "schedule",
    translated.schedule_id ?? `${translated.id}:schedule`,
    "title",
    translated.schedules?.title,
    (value) => {
      if (translated.schedules) translated.schedules.title = value;
    },
  );
  add("run", translated.id, "output.text", translated.output?.text, (value) => {
    if (translated.output) translated.output.text = value;
  });
  add("run", translated.id, "error_text", translated.error_text, (value) => {
    translated.error_text = value;
  });

  translated.message_history?.forEach((step, index) => {
    if (step.kind === "user" || step.kind === "assistant") {
      add(
        "run_message",
        `${translated.id}:${index}`,
        `${step.kind}.text`,
        step.text,
        (value) => {
          step.text = value;
        },
      );
    } else if (step.kind === "error") {
      add(
        "run_message",
        `${translated.id}:${index}`,
        "error.message",
        step.message,
        (value) => {
          step.message = value;
        },
      );
    }
  });

  addRunInputFields(translated.id, translated.input, add);

  if (inputs.length === 0) return translated;
  const values = await translateContentBatch(
    translated.workspace_id,
    locale,
    inputs,
    {
      credentialOwnerUserId: userId,
      businessId: translated.business_id,
      navNodeId: translated.nav_node_id ?? null,
    },
  );
  values.forEach((value, index) => setters[index]?.(value));
  return translated;
}

function cloneRunInput(input: unknown): unknown {
  const record = asRecord(input);
  if (!record) return input;
  const copy: Record<string, unknown> = { ...record };
  if (Array.isArray(copy.messages)) {
    copy.messages = copy.messages.map((message) =>
      asRecord(message) ? { ...message } : message,
    );
  }
  return copy;
}

function addRunInputFields(
  runId: string,
  input: unknown,
  add: (
    sourceKind: string,
    sourceId: string,
    field: string,
    text: string | null | undefined,
    setter: (value: string) => void,
  ) => void,
) {
  const record = asRecord(input);
  if (!record) return;

  if (typeof record.prompt === "string") {
    add("run_input", runId, "prompt", record.prompt, (value) => {
      record.prompt = value;
    });
  }
  if (!Array.isArray(record.messages)) return;

  record.messages.forEach((message, index) => {
    const messageRecord = asRecord(message);
    if (!messageRecord || typeof messageRecord.content !== "string") return;
    add(
      "run_input_message",
      `${runId}:${index}`,
      "content",
      messageRecord.content,
      (value) => {
        messageRecord.content = value;
      },
    );
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
