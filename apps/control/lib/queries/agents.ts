// Server-side helpers for reading agents. RLS enforces workspace membership.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type AgentRow = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  name: string;
  kind: "chat" | "worker" | "reviewer" | "generator" | "router";
  provider:
    | "claude"
    | "openrouter"
    | "minimax"
    | "ollama"
    | "openclaw"
    | "hermes"
    | "codex";
  model: string | null;
  config: Record<string, unknown>;
  telegram_target_id?: string | null;
  custom_integration_id?: string | null;
};

export async function getAgentById(id: string): Promise<AgentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, workspace_id, business_id, name, kind, provider, model, config, telegram_target_id, custom_integration_id",
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("getAgentById failed", error);
    return null;
  }
  return data as AgentRow | null;
}

export async function listAgentsForWorkspace(
  workspaceId: string,
): Promise<AgentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, workspace_id, business_id, name, kind, provider, model, config, telegram_target_id, custom_integration_id",
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listAgentsForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as AgentRow[];
}
