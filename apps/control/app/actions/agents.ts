// Server actions for agent CRUD. RLS handles auth via workspace_members
// role lookup; we still set workspace_id explicitly so the policy + audit
// trigger pick it up.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type AgentInput = {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  name: string;
  kind?: "chat" | "worker" | "reviewer" | "generator" | "router";
  provider:
    | "claude"
    | "openrouter"
    | "minimax"
    | "ollama"
    | "openclaw"
    | "hermes"
    | "codex";
  model?: string;
  systemPrompt?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  /** JSON-encoded RoutingRule[] from @aio/ai/router. Validated upstream. */
  routingRulesJson?: string;
  /** Optional notification routing — falls back to workspace defaults. */
  telegram_target_id?: string | null;
  custom_integration_id?: string | null;
  /** Chain hooks: when this agent's run finishes, queue the next one. */
  next_agent_on_done?: string | null;
  next_agent_on_fail?: string | null;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createAgent(
  input: AgentInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim()) {
    return { ok: false, error: "Naam mag niet leeg zijn." };
  }

  // Validate routing-rules JSON before we even talk to the DB so a
  // mistyped textarea doesn't end up persisted as garbage. We only check
  // shape (must be an array of objects with match + use); the router
  // tolerates unknown match keys at runtime.
  let routingRules: unknown[] | undefined;
  if (input.routingRulesJson?.trim()) {
    try {
      const parsed = JSON.parse(input.routingRulesJson);
      if (!Array.isArray(parsed)) throw new Error("must be an array");
      for (const rule of parsed) {
        if (!rule || typeof rule !== "object")
          throw new Error("each rule must be an object");
        if (!("match" in rule) || !("use" in rule))
          throw new Error("each rule needs `match` and `use`");
      }
      routingRules = parsed;
    } catch (err) {
      return {
        ok: false,
        error:
          "Routing rules JSON is ongeldig: " +
          (err instanceof Error ? err.message : "parse error"),
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agents")
    .insert({
      workspace_id: input.workspace_id,
      business_id: input.business_id,
      name: input.name.trim(),
      kind: input.kind ?? "chat",
      provider: input.provider,
      model: input.model?.trim() || null,
      config: {
        systemPrompt: input.systemPrompt?.trim() || null,
        endpoint: input.endpoint?.trim() || null,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        routingRules,
      },
      telegram_target_id: input.telegram_target_id ?? null,
      custom_integration_id: input.custom_integration_id ?? null,
      next_agent_on_done: input.next_agent_on_done ?? null,
      next_agent_on_fail: input.next_agent_on_fail ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function updateAgent(input: {
  workspace_slug: string;
  business_id: string;
  id: string;
  patch: {
    name?: string;
    kind?: AgentInput["kind"];
    provider?: AgentInput["provider"];
    model?: string | null;
    systemPrompt?: string | null;
    endpoint?: string | null;
    telegram_target_id?: string | null;
    custom_integration_id?: string | null;
    next_agent_on_done?: string | null;
    next_agent_on_fail?: string | null;
    notify_email?: string | null;
  };
}): Promise<ActionResult<null>> {
  const patch: Record<string, unknown> = {};
  if (input.patch.name !== undefined) {
    if (!input.patch.name.trim())
      return { ok: false, error: "Naam mag niet leeg zijn." };
    patch.name = input.patch.name.trim();
  }
  if (input.patch.kind !== undefined) patch.kind = input.patch.kind;
  if (input.patch.provider !== undefined) patch.provider = input.patch.provider;
  if (input.patch.model !== undefined)
    patch.model = input.patch.model?.toString().trim() || null;
  if (input.patch.telegram_target_id !== undefined)
    patch.telegram_target_id = input.patch.telegram_target_id ?? null;
  if (input.patch.custom_integration_id !== undefined)
    patch.custom_integration_id = input.patch.custom_integration_id ?? null;
  if (input.patch.next_agent_on_done !== undefined)
    patch.next_agent_on_done = input.patch.next_agent_on_done ?? null;
  if (input.patch.next_agent_on_fail !== undefined)
    patch.next_agent_on_fail = input.patch.next_agent_on_fail ?? null;
  if (input.patch.notify_email !== undefined)
    patch.notify_email = input.patch.notify_email?.toString().trim() || null;

  // Config fields are merged into the existing jsonb so we don't
  // clobber routing rules or temperature.
  if (
    input.patch.systemPrompt !== undefined ||
    input.patch.endpoint !== undefined
  ) {
    const supabase = await createSupabaseServerClient();
    const { data: cur } = await supabase
      .from("agents")
      .select("config")
      .eq("id", input.id)
      .maybeSingle();
    const config = (cur?.config ?? {}) as Record<string, unknown>;
    if (input.patch.systemPrompt !== undefined)
      config.systemPrompt = input.patch.systemPrompt?.trim() || null;
    if (input.patch.endpoint !== undefined)
      config.endpoint = input.patch.endpoint?.trim() || null;
    patch.config = config;
  }

  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("agents")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  return { ok: true, data: null };
}

export async function duplicateAgent(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  source_id: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: src } = await supabase
    .from("agents")
    .select(
      "name, kind, provider, model, config, telegram_target_id, custom_integration_id",
    )
    .eq("id", input.source_id)
    .maybeSingle();
  if (!src) return { ok: false, error: "Origineel niet gevonden." };

  const { data, error } = await supabase
    .from("agents")
    .insert({
      workspace_id: input.workspace_id,
      business_id: input.business_id,
      name: `${src.name} (kopie)`,
      kind: src.kind,
      provider: src.provider,
      model: src.model,
      config: src.config,
      telegram_target_id: src.telegram_target_id,
      custom_integration_id: src.custom_integration_id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert faalde." };

  revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function archiveAgent(input: {
  workspace_slug: string;
  business_id: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("agents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  return { ok: true, data: null };
}
