// Server-side helpers for reading agents. RLS enforces workspace membership.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type AgentRow = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  nav_node_id: string | null;
  topic_ids: string[];
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
    | "openai_codex"
    | "codex";
  model: string | null;
  config: Record<string, unknown>;
  /** Where the credential comes from. "subscription" agents (Claude
   *  Pro/Max) must NOT be triggered via webhook / manual / chain — see
   *  dispatch/runs.ts and SchedulesPanel guard. */
  key_source?: "env" | "tiered" | "subscription" | null;
  telegram_target_id?: string | null;
  custom_integration_id?: string | null;
  writing_style_id?: string | null;
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
};

export async function getAgentById(id: string): Promise<AgentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, workspace_id, business_id, nav_node_id, name, kind, provider, model, config, key_source, telegram_target_id, custom_integration_id, writing_style_id, next_agent_on_done, next_agent_on_fail, notify_email, allowed_tools, allowed_skills",
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("getAgentById failed", error);
    return null;
  }
  const rows = await hydrateAgentTopicIds(
    supabase,
    data ? ([data] as AgentRow[]) : [],
  );
  return rows[0] ?? null;
}

export async function listAgentsForWorkspace(
  workspaceId: string,
  scope: "all" | "global" | "business" = "all",
): Promise<AgentRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("agents")
    .select(
      "id, workspace_id, business_id, nav_node_id, name, kind, provider, model, config, key_source, telegram_target_id, custom_integration_id, writing_style_id, next_agent_on_done, next_agent_on_fail, notify_email, allowed_tools, allowed_skills",
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
  return hydrateAgentTopicIds(supabase, (data ?? []) as AgentRow[]);
}

/** Convenience wrapper: workspace-global (business_id IS NULL) only. */
export async function listGlobalAgents(
  workspaceId: string,
): Promise<AgentRow[]> {
  return listAgentsForWorkspace(workspaceId, "global");
}

async function hydrateAgentTopicIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: AgentRow[],
): Promise<AgentRow[]> {
  if (rows.length === 0) return rows;

  const fallbackRows = () =>
    rows.map((row) => ({
      ...row,
      topic_ids: uniqueIds(row.nav_node_id ? [row.nav_node_id] : []),
    }));

  const { data, error } = await supabase
    .from("agent_topic_links")
    .select("agent_id, nav_node_id")
    .in(
      "agent_id",
      rows.map((row) => row.id),
    );
  if (error) {
    console.error("hydrateAgentTopicIds failed", error);
    return fallbackRows();
  }

  const byAgent = new Map<string, string[]>();
  for (const link of (data ?? []) as Array<{
    agent_id: string;
    nav_node_id: string;
  }>) {
    const current = byAgent.get(link.agent_id) ?? [];
    current.push(link.nav_node_id);
    byAgent.set(link.agent_id, current);
  }

  return rows.map((row) => ({
    ...row,
    topic_ids: uniqueIds([
      ...(byAgent.get(row.id) ?? []),
      ...(row.nav_node_id ? [row.nav_node_id] : []),
    ]),
  }));
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
