// Server actions for schedule lifecycle. We talk to Anthropic's Routines API
// from the server only so the bearer tokens never reach the browser. Webhook
// secrets are returned ONCE on creation/rotation and only the sha256 hash is
// persisted server-side.

"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createRoutine, deleteRoutine } from "@aio/ai/routines";

import { dispatchRun } from "../../lib/dispatch/runs";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ScheduleKind = "cron" | "webhook" | "manual";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mintWebhookSecret(): string {
  // 32 random bytes → 43-char base64url, plenty of entropy + URL-safe.
  return randomBytes(32).toString("base64url");
}

export async function createCronSchedule(input: {
  workspace_slug: string;
  workspace_id: string;
  agent_id: string;
  business_id?: string | null;
  cron_expr: string;
  prompt: string;
  callback_url: string;
  mcp_servers?: Array<{ name: string; url: string }>;
  title?: string | null;
  description?: string | null;
  instructions?: string | null;
  timezone?: string;
  telegram_target_id?: string | null;
  custom_integration_id?: string | null;
}): Promise<ActionResult<{ id: string; routine_id: string }>> {
  const supabase = await createSupabaseServerClient();

  // 1. Create the routine on Anthropic's side first. If it fails, we don't
  // leave a half-baked schedules row behind.
  const routine = await createRoutine({
    prompt: input.prompt,
    trigger: { type: "cron", expression: input.cron_expr },
    postTo: input.callback_url,
    mcpServers: input.mcp_servers,
    allowedTools: ["web_search"],
  }).catch((err: Error) => err);
  if (routine instanceof Error) return { ok: false, error: routine.message };

  // 2. Persist the schedule row. Bearer token is encrypted in the column
  // via the agent_secret_key env. If the user hasn't set the key we bail.
  const key = process.env.AGENT_SECRET_KEY;
  if (!key) {
    // Roll back the Anthropic-side routine so we don't leak quota.
    await deleteRoutine(routine.id).catch(() => {});
    return { ok: false, error: "AGENT_SECRET_KEY is not configured." };
  }

  const { data, error } = await supabase
    .from("schedules")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      business_id: input.business_id ?? null,
      kind: "cron" satisfies ScheduleKind,
      cron_expr: input.cron_expr,
      provider_routine_id: routine.id,
      provider_bearer_token: routine.bearer_token
        ? Buffer.from(routine.bearer_token, "utf8").toString("base64")
        : null,
      title: input.title ?? null,
      description: input.description ?? null,
      instructions: input.instructions ?? null,
      timezone: input.timezone ?? "Europe/Amsterdam",
      telegram_target_id: input.telegram_target_id ?? null,
      custom_integration_id: input.custom_integration_id ?? null,
    })
    .select("id, provider_routine_id")
    .single();

  if (error || !data) {
    await deleteRoutine(routine.id).catch(() => {});
    return {
      ok: false,
      error: error?.message ?? "Failed to persist schedule.",
    };
  }

  revalidatePath(`/${input.workspace_slug}/business/${input.business_id ?? ""}`);
  return {
    ok: true,
    data: { id: data.id, routine_id: data.provider_routine_id! },
  };
}

export async function createWebhookSchedule(input: {
  workspace_slug: string;
  workspace_id: string;
  agent_id: string;
  business_id?: string | null;
}): Promise<ActionResult<{ id: string; secret: string }>> {
  const supabase = await createSupabaseServerClient();
  const secret = mintWebhookSecret();
  const { data, error } = await supabase
    .from("schedules")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      business_id: input.business_id ?? null,
      kind: "webhook" satisfies ScheduleKind,
      webhook_secret_hash: sha256(secret),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidatePath(`/${input.workspace_slug}/business/${input.business_id ?? ""}`);
  return { ok: true, data: { id: data.id, secret } };
}

export async function rotateWebhookSecret(input: {
  workspace_slug: string;
  schedule_id: string;
}): Promise<ActionResult<{ secret: string }>> {
  const supabase = await createSupabaseServerClient();
  const secret = mintWebhookSecret();
  const { error } = await supabase
    .from("schedules")
    .update({ webhook_secret_hash: sha256(secret) })
    .eq("id", input.schedule_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}`);
  return { ok: true, data: { secret } };
}

export async function createManualSchedule(input: {
  workspace_slug: string;
  workspace_id: string;
  agent_id: string;
  business_id?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedules")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      business_id: input.business_id ?? null,
      kind: "manual" satisfies ScheduleKind,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidatePath(`/${input.workspace_slug}`);
  return { ok: true, data: { id: data.id } };
}

export async function runAgentNow(input: {
  workspace_slug: string;
  workspace_id: string;
  agent_id: string;
  business_id?: string | null;
  prompt?: string;
}): Promise<ActionResult<{ run_id: string }>> {
  const supabase = await createSupabaseServerClient();
  // Phase 5: a manual run just queues a row and returns immediately. The
  // ChatPanel and (later) a worker dispatcher pick up queued rows and
  // execute. This keeps the action fast + auditable; long-running calls
  // belong on the chat SSE route, not a server action.
  const { data, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      business_id: input.business_id ?? null,
      triggered_by: "manual",
      status: "queued",
      input: input.prompt ? { prompt: input.prompt } : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  // Fire the dispatcher in the background — same pattern as webhook
  // triggers. Don't await: the action returns immediately and the run
  // row tracks status.
  void dispatchRun(data.id).catch((err: unknown) => {
    console.error("dispatchRun failed", err);
  });

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id ?? ""}/schedules`,
  );
  return { ok: true, data: { run_id: data.id } };
}

export async function toggleSchedule(input: {
  workspace_slug: string;
  schedule_id: string;
  enabled: boolean;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("schedules")
    .update({ enabled: input.enabled })
    .eq("id", input.schedule_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}`);
  return { ok: true, data: null };
}

export async function updateSchedule(input: {
  workspace_slug: string;
  schedule_id: string;
  patch: {
    title?: string | null;
    description?: string | null;
    instructions?: string | null;
    cron_expr?: string;
    timezone?: string;
    telegram_target_id?: string | null;
    custom_integration_id?: string | null;
    enabled?: boolean;
  };
}): Promise<ActionResult<null>> {
  const patch: Record<string, unknown> = {};
  if (input.patch.title !== undefined) patch.title = input.patch.title;
  if (input.patch.description !== undefined)
    patch.description = input.patch.description;
  if (input.patch.instructions !== undefined)
    patch.instructions = input.patch.instructions;
  if (input.patch.cron_expr !== undefined) patch.cron_expr = input.patch.cron_expr;
  if (input.patch.timezone !== undefined) patch.timezone = input.patch.timezone;
  if (input.patch.telegram_target_id !== undefined)
    patch.telegram_target_id = input.patch.telegram_target_id;
  if (input.patch.custom_integration_id !== undefined)
    patch.custom_integration_id = input.patch.custom_integration_id;
  if (input.patch.enabled !== undefined) patch.enabled = input.patch.enabled;

  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("schedules")
    .update(patch)
    .eq("id", input.schedule_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}`);
  return { ok: true, data: null };
}

export async function deleteSchedule(input: {
  workspace_slug: string;
  schedule_id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  // Read the routine_id first so we can delete it from Anthropic side
  // before the row goes away.
  const { data: existing } = await supabase
    .from("schedules")
    .select("provider_routine_id")
    .eq("id", input.schedule_id)
    .maybeSingle();
  if (existing?.provider_routine_id) {
    await deleteRoutine(existing.provider_routine_id).catch((err: Error) => {
      console.warn("deleteRoutine on Anthropic failed:", err.message);
    });
  }
  const { error } = await supabase
    .from("schedules")
    .delete()
    .eq("id", input.schedule_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}`);
  return { ok: true, data: null };
}
