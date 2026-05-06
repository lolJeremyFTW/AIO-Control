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
  /** Origin (no path) for building the Routines callback URL on the
   *  subscription path. Ignored when the agent uses local cron. */
  callback_origin?: string;
  mcp_servers?: Array<{ name: string; url: string }>;
  title?: string | null;
  description?: string | null;
  instructions?: string | null;
  timezone?: string;
  telegram_target_id?: string | null;
  custom_integration_id?: string | null;
}): Promise<ActionResult<{ id: string; routine_id: string | null }>> {
  const supabase = await createSupabaseServerClient();

  // Look up the agent so we know whether to route this through Claude
  // Routines (subscription Claude — runs on Claude's own infra) or
  // through our local cron-scheduler (everything else).
  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("provider, key_source")
    .eq("id", input.agent_id)
    .maybeSingle();
  if (agentErr || !agent) {
    return { ok: false, error: "Agent niet gevonden." };
  }
  const useRoutines =
    agent.provider === "claude" && agent.key_source === "subscription";

  if (useRoutines) {
    // ── Subscription Claude — schedule on Anthropic's infra ─────────
    if (!input.callback_origin) {
      return {
        ok: false,
        error: "callback_origin is verplicht voor subscription-Claude.",
      };
    }
    // Payload-based callback (no run_id in URL). The result handler
    // looks the schedule up by routine_id from the body and creates
    // its own runs row. See /api/runs/result/route.ts.
    const callback = `${input.callback_origin}/api/runs/result`;
    const routine = await createRoutine({
      prompt: input.prompt,
      trigger: { type: "cron", expression: input.cron_expr },
      postTo: callback,
      mcpServers: input.mcp_servers,
      allowedTools: ["web_search"],
    }).catch((err: Error) => err);
    if (routine instanceof Error) {
      return { ok: false, error: routine.message };
    }

    const key = process.env.AGENT_SECRET_KEY;
    if (!key) {
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
        instructions: input.instructions ?? input.prompt ?? null,
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
    revalidatePath(
      `/${input.workspace_slug}/business/${input.business_id ?? ""}`,
    );
    return {
      ok: true,
      data: { id: data.id, routine_id: data.provider_routine_id },
    };
  }

  // ── Local cron (default for non-Claude AND for Claude+API key) ────
  // No external API call; the cron-scheduler bootstrap in
  // instrumentation.ts will pick this row up on its next minute tick.
  const { data, error } = await supabase
    .from("schedules")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      business_id: input.business_id ?? null,
      kind: "cron" satisfies ScheduleKind,
      cron_expr: input.cron_expr,
      title: input.title ?? null,
      description: input.description ?? null,
      // Stash the prompt as `instructions` so the dispatcher uses it
      // when the cron tick fires.
      instructions: input.instructions ?? input.prompt ?? null,
      timezone: input.timezone ?? "Europe/Amsterdam",
      telegram_target_id: input.telegram_target_id ?? null,
      custom_integration_id: input.custom_integration_id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Failed to persist schedule.",
    };
  }
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id ?? ""}`,
  );
  return { ok: true, data: { id: data.id, routine_id: null } };
}

export async function createWebhookSchedule(input: {
  workspace_slug: string;
  workspace_id: string;
  agent_id: string;
  business_id?: string | null;
}): Promise<ActionResult<{ id: string; secret: string }>> {
  const supabase = await createSupabaseServerClient();

  // Pre-flight: don't let users wire a webhook to a subscription-Claude
  // agent — webhooks fire on every external POST and would hammer the
  // local CLI on a schedule no human controls. Anthropic bans accounts
  // for that. Direct them to either a cron schedule (which routes via
  // Anthropic Routines) or an API-key agent.
  const { data: agent } = await supabase
    .from("agents")
    .select("key_source")
    .eq("id", input.agent_id)
    .maybeSingle();
  if (agent?.key_source === "subscription") {
    return {
      ok: false,
      error:
        "Subscription-Claude agents mogen niet via webhook getriggerd worden. Gebruik een cron-schedule (Anthropic Routines) of switch deze agent naar een API-key.",
    };
  }

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
  /** When set, fall back to this schedule's stored instructions if
   *  the caller didn't pass an explicit prompt. Lets the per-card
   *  "▶ Run now" button on existing cron schedules use the schedule's
   *  saved prompt instead of sending "(no input)". */
  schedule_id?: string | null;
}): Promise<ActionResult<{ run_id: string }>> {
  const supabase = await createSupabaseServerClient();
  // Phase 5: a manual run just queues a row and returns immediately. The
  // ChatPanel and (later) a worker dispatcher pick up queued rows and
  // execute. This keeps the action fast + auditable; long-running calls
  // belong on the chat SSE route, not a server action.
  // Inherit the agent's topic pin so the run shows up on the right
  // per-topic dashboard. Cheap extra round-trip; agent rows are tiny.
  const { data: agentRow } = await supabase
    .from("agents")
    .select("nav_node_id")
    .eq("id", input.agent_id)
    .maybeSingle();

  // Resolve the prompt: explicit input wins, else the schedule's saved
  // instructions, else null (dispatcher will surface "(no input)" so the
  // user knows nothing was sent).
  let prompt: string | null = input.prompt?.trim() || null;
  if (!prompt && input.schedule_id) {
    const { data: schedRow } = await supabase
      .from("schedules")
      .select("instructions")
      .eq("id", input.schedule_id)
      .maybeSingle();
    const inst = (schedRow?.instructions as string | null | undefined) ?? null;
    if (inst && inst.trim()) prompt = inst.trim();
  }

  const { data, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      business_id: input.business_id ?? null,
      nav_node_id: agentRow?.nav_node_id ?? null,
      triggered_by: "manual",
      status: "queued",
      input: prompt ? { prompt } : null,
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
    /** Repoint the schedule at a different agent. Useful when the
     *  original agent was on the wrong provider — no need to delete
     *  + recreate the cron schedule + Routine. */
    agent_id?: string;
    title?: string | null;
    description?: string | null;
    instructions?: string | null;
    cron_expr?: string;
    timezone?: string;
    telegram_target_id?: string | null;
    custom_integration_id?: string | null;
    nav_node_id?: string | null;
    enabled?: boolean;
  };
}): Promise<ActionResult<null>> {
  const patch: Record<string, unknown> = {};
  if (input.patch.agent_id !== undefined) patch.agent_id = input.patch.agent_id;
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
  if (input.patch.nav_node_id !== undefined) patch.nav_node_id = input.patch.nav_node_id;
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
