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
      },
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
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
