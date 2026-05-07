// Server actions for agent CRUD. RLS handles auth via workspace_members
// role lookup; we still set workspace_id explicitly so the policy + audit
// trigger pick it up.

"use server";

import { revalidatePath } from "next/cache";

import {
  getValidNotificationTargetIds,
  replaceNotificationBindings,
} from "../../lib/notify/bindings";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export type AgentKeySource = "subscription" | "api_key" | "env";

export type AgentInput = {
  workspace_slug: string;
  workspace_id: string;
  /** Nullable so workspace-global agents (no specific business) can be
   *  created. The agents table already supports this in the schema. */
  business_id: string | null;
  name: string;
  kind?: "chat" | "worker" | "reviewer" | "generator" | "router";
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
  notification_target_ids?: string[];
  /** Chain hooks: when this agent's run finishes, queue the next one. */
  next_agent_on_done?: string | null;
  next_agent_on_fail?: string | null;
  /** Where this agent's credentials come from. See migration 036. Only
   *  'subscription' is meaningful for Claude — drives whether cron
   *  schedules go through Anthropic Routines or our local scheduler. */
  key_source?: AgentKeySource;
  /** Pin the agent to a topic (nav_node) at creation time. NULL =
   *  belongs to the business as a whole (current behaviour). */
  nav_node_id?: string | null;
  /** Full topic link set. nav_node_id remains the first/default topic
   *  for older dispatch paths that only know one topic. */
  nav_node_ids?: string[];
  /** Names of MCP servers this agent should host. For provider="minimax"
   *  pick from "minimax", "filesystem", "fetch". streamMinimax spawns
   *  each native via @aio/ai/mcp/host. */
  mcpServers?: string[];
  /** Per-MCP-server scope. */
  mcpPermissions?: {
    filesystem?: "off" | "ro" | "rw";
    aio?: "off" | "ro" | "rw";
  };
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

async function getValidAgentTopicIds(
  supabase: SupabaseServerClient,
  input: {
    workspaceId: string;
    businessId: string | null;
    topicIds: Array<string | null | undefined>;
  },
): Promise<ActionResult<string[]>> {
  const ids = uniqueIds(input.topicIds);
  if (ids.length === 0) return { ok: true, data: [] };
  if (!input.businessId) {
    return {
      ok: false,
      error:
        "Workspace-globale agents kunnen niet aan business-topics worden gekoppeld.",
    };
  }

  const { data, error } = await supabase
    .from("nav_nodes")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("business_id", input.businessId)
    .is("archived_at", null)
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const valid = new Set(
    ((data ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
  const missing = ids.filter((id) => !valid.has(id));
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Een of meer topics horen niet bij deze business.",
    };
  }

  return { ok: true, data: ids };
}

async function replaceAgentTopicLinks(
  supabase: SupabaseServerClient,
  input: {
    workspaceId: string;
    businessId: string | null;
    agentId: string;
    topicIds: string[];
  },
): Promise<ActionResult<null>> {
  const { error: deleteError } = await supabase
    .from("agent_topic_links")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("agent_id", input.agentId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (!input.businessId || input.topicIds.length === 0) {
    return { ok: true, data: null };
  }

  const { error: insertError } = await supabase
    .from("agent_topic_links")
    .insert(
      input.topicIds.map((topicId) => ({
        workspace_id: input.workspaceId,
        business_id: input.businessId,
        agent_id: input.agentId,
        nav_node_id: topicId,
      })),
    );
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, data: null };
}

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

  // Subscription mode is Claude-only (Pro/Max/Team). Reject silently
  // for other providers so a misclick doesn't persist nonsense.
  const keySource: AgentKeySource =
    input.key_source &&
    (input.key_source !== "subscription" ||
      input.provider === "claude" ||
      input.provider === "claude_cli")
      ? input.key_source
      : "env";

  const supabase = await createSupabaseServerClient();
  const topicIds = await getValidAgentTopicIds(supabase, {
    workspaceId: input.workspace_id,
    businessId: input.business_id,
    topicIds:
      input.nav_node_ids !== undefined
        ? input.nav_node_ids
        : [input.nav_node_id],
  });
  if (!topicIds.ok) return topicIds;

  const notificationTargetIds = await getValidNotificationTargetIds(
    supabase,
    input.workspace_id,
    input.notification_target_ids,
  );
  if (!notificationTargetIds.ok) return notificationTargetIds;

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
        ...(input.mcpServers && input.mcpServers.length > 0
          ? { mcpServers: input.mcpServers }
          : {}),
        ...(input.mcpPermissions && Object.keys(input.mcpPermissions).length > 0
          ? { mcpPermissions: input.mcpPermissions }
          : {}),
        routingRules,
      },
      telegram_target_id: input.telegram_target_id ?? null,
      custom_integration_id: input.custom_integration_id ?? null,
      next_agent_on_done: input.next_agent_on_done ?? null,
      next_agent_on_fail: input.next_agent_on_fail ?? null,
      key_source: keySource,
      nav_node_id: topicIds.data[0] ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  const topicLinkRes = await replaceAgentTopicLinks(supabase, {
    workspaceId: input.workspace_id,
    businessId: input.business_id,
    agentId: data.id,
    topicIds: topicIds.data,
  });
  if (!topicLinkRes.ok) {
    await supabase.from("agents").delete().eq("id", data.id);
    return { ok: false, error: topicLinkRes.error };
  }
  if (notificationTargetIds.data.length > 0) {
    const bindingRes = await replaceNotificationBindings(supabase, {
      workspaceId: input.workspace_id,
      ownerType: "agent",
      ownerId: data.id,
      targetIds: notificationTargetIds.data,
    });
    if (!bindingRes.ok) {
      await supabase.from("agents").delete().eq("id", data.id);
      return { ok: false, error: bindingRes.error };
    }
  }
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id ?? ""}`,
  );
  // Workspace-global agents also surface on /[ws]/agents — refresh that
  // route when business_id is null so the new row appears.
  if (!input.business_id) {
    revalidatePath(`/${input.workspace_slug}/agents`);
  }
  return { ok: true, data: { id: data.id } };
}

export async function updateAgent(input: {
  workspace_slug: string;
  workspace_id?: string;
  /** null = workspace-global agent (revalidates the global page). */
  business_id: string | null;
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
    notification_target_ids?: string[] | null;
    next_agent_on_done?: string | null;
    next_agent_on_fail?: string | null;
    notify_email?: string | null;
    /** Workstream H. null = use kind defaults; explicit array = allow-list. */
    allowed_tools?: string[] | null;
    /** Workspace-scoped skill ids the agent is allowed to use. Their
     *  markdown bodies get injected into the system-prompt preamble.
     *  NULL / empty array = no extra skills. */
    allowed_skills?: string[] | null;
    /** Pin to a topic (nav_node). null = unpin (belongs to the
     *  business as a whole). Powers the per-topic dashboards via
     *  migration 043. */
    nav_node_id?: string | null;
    /** Full topic link set. nav_node_id is derived from the first
     *  selected topic for backwards-compatible run attribution. */
    nav_node_ids?: string[] | null;
    /** Names of MCP servers the agent should host (provider-specific).
     *  For provider="minimax" the known servers are "minimax",
     *  "filesystem", "fetch". streamMinimax spawns each via
     *  @aio/ai/mcp/host and exposes their tools to the model. */
    mcpServers?: string[] | null;
    /** Per-MCP-server scope rules ("off" / "ro" / "rw").
     *  Stored as agent.config.mcpPermissions. */
    mcpPermissions?: {
      filesystem?: "off" | "ro" | "rw";
      aio?: "off" | "ro" | "rw";
    } | null;
    /** Maximum tool-call hops for MiniMax agents. null = use the global
     *  AGENT_MAX_HOPS env var (default 150). */
    maxHops?: number | null;
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
  if (input.patch.allowed_tools !== undefined)
    patch.allowed_tools = input.patch.allowed_tools;
  if (input.patch.allowed_skills !== undefined) {
    // Treat empty array as NULL so the index-condition stays clean
    // (idx_agents_allowed_skills_present uses WHERE … IS NOT NULL).
    const v = input.patch.allowed_skills;
    patch.allowed_skills = !v || v.length === 0 ? null : v;
  }
  const hasNotificationBindingPatch =
    input.patch.notification_target_ids !== undefined;
  const hasTopicLinkPatch =
    input.patch.nav_node_ids !== undefined ||
    input.patch.nav_node_id !== undefined;
  const supabase = await createSupabaseServerClient();
  let agentScope: { workspace_id: string; business_id: string | null } | null =
    null;
  if (
    hasTopicLinkPatch ||
    (hasNotificationBindingPatch && !input.workspace_id)
  ) {
    const { data: agentRow, error: agentError } = await supabase
      .from("agents")
      .select("workspace_id, business_id")
      .eq("id", input.id)
      .maybeSingle();
    if (agentError || !agentRow?.workspace_id) {
      return { ok: false, error: "Agent niet gevonden." };
    }
    agentScope = agentRow as {
      workspace_id: string;
      business_id: string | null;
    };
  }

  const agentWorkspaceId =
    agentScope?.workspace_id ?? input.workspace_id ?? null;
  const agentBusinessId = agentScope?.business_id ?? input.business_id;
  let topicIds: string[] | null = null;
  if (hasTopicLinkPatch) {
    if (!agentWorkspaceId) {
      return { ok: false, error: "Agent niet gevonden." };
    }
    const validTopicIds = await getValidAgentTopicIds(supabase, {
      workspaceId: agentWorkspaceId,
      businessId: agentBusinessId,
      topicIds:
        input.patch.nav_node_ids !== undefined
          ? (input.patch.nav_node_ids ?? [])
          : [input.patch.nav_node_id],
    });
    if (!validTopicIds.ok) return validTopicIds;
    topicIds = validTopicIds.data;
    patch.nav_node_id = topicIds[0] ?? null;
  }

  let notificationWorkspaceId: string | null = null;
  let notificationTargetIds: string[] | null = null;
  if (hasNotificationBindingPatch) {
    notificationWorkspaceId = agentWorkspaceId;
    if (!notificationWorkspaceId)
      return { ok: false, error: "Agent niet gevonden." };
    const validTargetIds = await getValidNotificationTargetIds(
      supabase,
      notificationWorkspaceId,
      input.patch.notification_target_ids,
    );
    if (!validTargetIds.ok) return validTargetIds;
    notificationTargetIds = validTargetIds.data;
  }

  // Config fields are merged into the existing jsonb so we don't
  // clobber routing rules or temperature.
  if (
    input.patch.systemPrompt !== undefined ||
    input.patch.endpoint !== undefined ||
    input.patch.mcpServers !== undefined ||
    input.patch.mcpPermissions !== undefined ||
    input.patch.maxHops !== undefined
  ) {
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
    if (input.patch.mcpServers !== undefined) {
      const arr = input.patch.mcpServers ?? [];
      // Drop the field entirely when empty so the router's
      // (config.mcpServers ?? []).length check stays clean.
      if (arr.length === 0) delete config.mcpServers;
      else config.mcpServers = arr;
    }
    if (input.patch.mcpPermissions !== undefined) {
      const perms = input.patch.mcpPermissions;
      // Empty / null → drop the field. Otherwise store as-is so the
      // router's mcpPermissions checks read it directly.
      if (!perms || Object.keys(perms).length === 0) {
        delete config.mcpPermissions;
      } else {
        config.mcpPermissions = perms;
      }
    }
    if (input.patch.maxHops !== undefined) {
      if (!input.patch.maxHops || input.patch.maxHops <= 0) {
        delete config.maxHops;
      } else {
        config.maxHops = input.patch.maxHops;
      }
    }
    patch.config = config;
  }

  if (
    Object.keys(patch).length === 0 &&
    !hasNotificationBindingPatch &&
    !hasTopicLinkPatch
  ) {
    return { ok: true, data: null };
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("agents")
      .update(patch)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  }
  if (hasTopicLinkPatch && agentWorkspaceId) {
    const topicLinkRes = await replaceAgentTopicLinks(supabase, {
      workspaceId: agentWorkspaceId,
      businessId: agentBusinessId,
      agentId: input.id,
      topicIds: topicIds ?? [],
    });
    if (!topicLinkRes.ok) return { ok: false, error: topicLinkRes.error };
  }
  if (hasNotificationBindingPatch && notificationWorkspaceId) {
    const bindingRes = await replaceNotificationBindings(supabase, {
      workspaceId: notificationWorkspaceId,
      ownerType: "agent",
      ownerId: input.id,
      targetIds: notificationTargetIds ?? [],
    });
    if (!bindingRes.ok) return { ok: false, error: bindingRes.error };
  }
  if (input.business_id) {
    revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  } else {
    revalidatePath(`/${input.workspace_slug}/agents`);
  }
  return { ok: true, data: null };
}

export async function duplicateAgent(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string | null;
  source_id: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: src } = await supabase
    .from("agents")
    .select(
      "name, kind, provider, model, config, telegram_target_id, custom_integration_id, nav_node_id",
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
      nav_node_id: src.nav_node_id ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "Insert faalde." };

  const { data: sourceTopicLinks } = await supabase
    .from("agent_topic_links")
    .select("nav_node_id")
    .eq("workspace_id", input.workspace_id)
    .eq("agent_id", input.source_id);
  const topicLinkRes = await replaceAgentTopicLinks(supabase, {
    workspaceId: input.workspace_id,
    businessId: input.business_id,
    agentId: data.id,
    topicIds: uniqueIds([
      ...((sourceTopicLinks ?? []) as Array<{ nav_node_id: string }>).map(
        (link) => link.nav_node_id,
      ),
      src.nav_node_id as string | null,
    ]),
  });
  if (!topicLinkRes.ok) {
    console.error("duplicateAgent topic link copy failed", {
      source_id: input.source_id,
      agent_id: data.id,
      error: topicLinkRes.error,
    });
  }

  const { data: sourceBindings } = await supabase
    .from("notification_bindings")
    .select("target_id")
    .eq("workspace_id", input.workspace_id)
    .eq("owner_type", "agent")
    .eq("owner_id", input.source_id);
  const bindingRes = await replaceNotificationBindings(supabase, {
    workspaceId: input.workspace_id,
    ownerType: "agent",
    ownerId: data.id,
    targetIds: ((sourceBindings ?? []) as Array<{ target_id: string }>).map(
      (binding) => binding.target_id,
    ),
  });
  if (!bindingRes.ok) {
    console.error("duplicateAgent notification binding copy failed", {
      source_id: input.source_id,
      agent_id: data.id,
      error: bindingRes.error,
    });
  }

  if (input.business_id) {
    revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  } else {
    revalidatePath(`/${input.workspace_slug}/agents`);
  }
  return { ok: true, data: { id: data.id } };
}

export async function archiveAgent(input: {
  workspace_slug: string;
  business_id: string | null;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("agents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  if (input.business_id) {
    revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  } else {
    revalidatePath(`/${input.workspace_slug}/agents`);
  }
  return { ok: true, data: null };
}
