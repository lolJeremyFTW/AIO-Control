// Server-side helpers for reading agents. RLS enforces workspace membership.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type AgentRow = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  nav_node_id: string | null;
  name: string;
  kind: "chat" | "worker" | "reviewer" | "generator" | "router";
  provider:
    | "claude"
    | "claude_cli"
    | "openrouter"
    | "minimax"
    | "ollama"
    | "openclaw"
    | "hermes"
    | "codex";
  model: string | null;
  config: Record<string, unknown>;
  /** Where the credential comes from. "subscription" agents (Claude
   *  Pro/Max) must NOT be triggered via webhook / manual / chain — see
   *  dispatch/runs.ts and SchedulesPanel guard. */
  key_source?: "env" | "tiered" | "subscription" | null;
  telegram_target_id?: string | null;
  custom_integration_id?: string | null;
  next_agent_on_done?: string | null;
  next_agent_on_fail?: string | null;
  notify_email?: string | null;
  /** Allow-list of AIO Control function-tool names. NULL = use the
   *  kind-default set (see @aio/ai/aio-tools defaultToolsForKind). */
  allowed_tools?: string[] | null;
  /** Workspace-scoped skill ids whose markdown bodies get injected
   *  into the agent's system-prompt preamble. NULL / empty = no
   *  extra skills. Managed via /[ws]/skills + EditAgentDialog. */
  allowed_skills?: string[] | null;
  /** Team membership: the ID of this agent's coordinator (kind='router').
   *  NULL = standalone agent. The coordinator uses dispatch_agent to
   *  delegate tasks to its subagents at runtime. */
  parent_agent_id?: string | null;
};

export async function getAgentById(id: string): Promise<AgentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, workspace_id, business_id, nav_node_id, name, kind, provider, model, config, key_source, telegram_target_id, custom_integration_id, next_agent_on_done, next_agent_on_fail, notify_email, allowed_tools, allowed_skills, parent_agent_id",
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
  scope: "all" | "global" | "business" = "all",
): Promise<AgentRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("agents")
    .select(
      "id, workspace_id, business_id, nav_node_id, name, kind, provider, model, config, key_source, telegram_target_id, custom_integration_id, next_agent_on_done, next_agent_on_fail, notify_email, allowed_tools, allowed_skills, parent_agent_id",
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  // Workspace-global agents have business_id IS NULL. Business-scoped
  // ones have a real business_id. The schema already supports both;
  // the UI just hadn't surfaced "global" until v3 workstream F.
  if (scope === "global") q = q.is("business_id", null);
  if (scope === "business") q = q.not("business_id", "is", null);
  const { data, error } = await q;
  if (error) {
    console.error("listAgentsForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as AgentRow[];
}

/** Convenience wrapper: workspace-global (business_id IS NULL) only. */
export async function listGlobalAgents(
  workspaceId: string,
): Promise<AgentRow[]> {
  return listAgentsForWorkspace(workspaceId, "global");
}
