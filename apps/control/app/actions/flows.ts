// Server action that creates an entire flow in one shot:
// agent → skills → schedule (in that order so IDs are available for linking).

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createAgent, archiveAgent, updateAgent } from "./agents";
import { createBusiness, archiveBusiness } from "./businesses";
import { createIntegration, deleteIntegration } from "./integrations";
import { createNavNode } from "./nav-nodes";
import { createSkill, archiveSkill, setAgentSkills } from "./skills";
import {
  createCronSchedule,
  createWebhookSchedule,
  createManualSchedule,
  deleteSchedule,
} from "./schedules";
import { getCurrentUser } from "../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { resolveApiKey } from "../../lib/api-keys/resolve";
import type {
  BlueprintAgentPlan,
  BlueprintIntegrationProvider,
  BusinessBlueprintPlan,
  FlowPlan,
} from "@aio/ai/flow-planner";

export type CreateFlowInput = {
  workspace_slug: string;
  workspace_id: string;
  business_id: string | null;
  plan: FlowPlan;
};

export type CreateFlowResult =
  | {
      ok: true;
      data: {
        agent_id: string;
        schedule_id?: string;
        schedule_kind?: NonNullable<FlowPlan["schedule"]>["kind"];
        webhook_secret?: string;
        webhook_url?: string;
        skill_ids: string[];
      };
    }
  | { ok: false; error: string };

export type CreateBusinessBlueprintInput = {
  workspace_slug: string;
  workspace_id: string;
  plan: BusinessBlueprintPlan;
};

export type CreateBusinessBlueprintResult =
  | {
      ok: true;
      data: {
        business_id: string;
        business_slug: string;
        topic_ids: string[];
        agent_ids: string[];
        schedule_ids: string[];
        integration_ids: string[];
        skill_ids: string[];
        webhook_urls: Array<{ schedule_id: string; url: string }>;
      };
    }
  | { ok: false; error: string };

function providerNeedsApiKey(
  provider: FlowPlan["agent"]["provider"] | BlueprintAgentPlan["provider"],
) {
  return provider !== "ollama";
}

function providerLabel(
  provider: FlowPlan["agent"]["provider"] | BlueprintAgentPlan["provider"],
) {
  if (provider === "claude") return "Claude";
  if (provider === "minimax") return "MiniMax";
  if (provider === "openrouter") return "OpenRouter";
  return "Ollama";
}

async function rollback(
  workspace_slug: string,
  business_id: string | null,
  agent_id: string | null,
  skill_ids: string[],
) {
  // Best-effort cleanup — ignore individual rollback errors.
  for (const id of skill_ids) {
    await archiveSkill({ workspace_slug, id }).catch(() => {});
  }
  if (agent_id) {
    await archiveAgent({ workspace_slug, business_id, id: agent_id }).catch(() => {});
  }
}

const INTEGRATION_PROVIDERS = new Set<BlueprintIntegrationProvider>([
  "youtube_data",
  "etsy",
  "drive",
  "stripe",
  "shopify",
  "openai",
  "anthropic",
  "openrouter",
  "minimax",
  "custom_mcp",
]);

function uniqueNonEmptyKeys(
  items: Array<{ key: string }>,
  label: string,
): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.key?.trim();
    if (!key) return `${label} heeft een lege key.`;
    if (seen.has(key)) return `${label} key "${key}" komt dubbel voor.`;
    seen.add(key);
  }
  return null;
}

function validateBusinessBlueprint(plan: BusinessBlueprintPlan): string | null {
  if (!plan.business.name.trim()) return "Business naam mag niet leeg zijn.";
  if (!plan.agents.length) return "Blueprint moet minstens 1 agent bevatten.";

  const topicKeyError = uniqueNonEmptyKeys(plan.topics, "Topic");
  if (topicKeyError) return topicKeyError;
  const skillKeyError = uniqueNonEmptyKeys(plan.skills, "Skill");
  if (skillKeyError) return skillKeyError;
  const agentKeyError = uniqueNonEmptyKeys(plan.agents, "Agent");
  if (agentKeyError) return agentKeyError;
  const integrationKeyError = uniqueNonEmptyKeys(plan.integrations, "Integration");
  if (integrationKeyError) return integrationKeyError;

  const topicKeys = new Set(plan.topics.map((topic) => topic.key));
  const skillKeys = new Set(plan.skills.map((skill) => skill.key));
  const agentKeys = new Set(plan.agents.map((agent) => agent.key));

  for (const topic of plan.topics) {
    if (topic.parent_key && !topicKeys.has(topic.parent_key)) {
      return `Topic "${topic.name}" verwijst naar onbekende parent "${topic.parent_key}".`;
    }
  }
  for (const skill of plan.skills) {
    if (!skill.name.trim() || !skill.description.trim() || !skill.body.trim()) {
      return `Skill "${skill.key}" is niet compleet.`;
    }
  }
  for (const agent of plan.agents) {
    if (!agent.name.trim()) return `Agent "${agent.key}" heeft geen naam.`;
    if (!agent.system_prompt.trim())
      return `Agent "${agent.name}" heeft geen system prompt.`;
    if (agent.topic_key && !topicKeys.has(agent.topic_key)) {
      return `Agent "${agent.name}" verwijst naar onbekend topic "${agent.topic_key}".`;
    }
    for (const skillKey of agent.skill_keys ?? []) {
      if (!skillKeys.has(skillKey)) {
        return `Agent "${agent.name}" verwijst naar onbekende skill "${skillKey}".`;
      }
    }
    if (agent.handoff_on_done_key && !agentKeys.has(agent.handoff_on_done_key)) {
      return `Agent "${agent.name}" heeft een onbekende done-handoff "${agent.handoff_on_done_key}".`;
    }
    if (agent.handoff_on_fail_key && !agentKeys.has(agent.handoff_on_fail_key)) {
      return `Agent "${agent.name}" heeft een onbekende fail-handoff "${agent.handoff_on_fail_key}".`;
    }
  }
  for (const schedule of plan.schedules) {
    if (!agentKeys.has(schedule.agent_key)) {
      return `Schedule "${schedule.title}" verwijst naar onbekende agent "${schedule.agent_key}".`;
    }
    if (schedule.topic_key && !topicKeys.has(schedule.topic_key)) {
      return `Schedule "${schedule.title}" verwijst naar onbekend topic "${schedule.topic_key}".`;
    }
    if (schedule.kind === "cron" && !schedule.cron_expr?.trim()) {
      return `Cron schedule "${schedule.title}" mist een cron expressie.`;
    }
    if (!schedule.prompt.trim()) {
      return `Schedule "${schedule.title}" heeft geen run prompt.`;
    }
  }
  for (const integration of plan.integrations) {
    if (!INTEGRATION_PROVIDERS.has(integration.provider)) {
      return `Integration "${integration.name}" heeft een onbekende provider.`;
    }
    if (!integration.name.trim()) {
      return `Integration "${integration.key}" heeft geen naam.`;
    }
  }

  return null;
}

function mcpPermissionsFor(
  agent: BlueprintAgentPlan,
): { filesystem?: "ro" | "rw"; aio?: "ro" | "rw" } | undefined {
  const next: { filesystem?: "ro" | "rw"; aio?: "ro" | "rw" } = {};
  const servers = agent.mcp_servers ?? [];
  if (agent.mcp_permissions?.filesystem) {
    next.filesystem = agent.mcp_permissions.filesystem;
  } else if (servers.includes("filesystem")) {
    next.filesystem = "ro";
  }
  if (agent.mcp_permissions?.aio) {
    next.aio = agent.mcp_permissions.aio;
  } else if (servers.includes("aio")) {
    next.aio = "ro";
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

async function rollbackBusinessBlueprint(input: {
  workspace_slug: string;
  business_id: string | null;
  agent_ids: string[];
  skill_ids: string[];
  schedule_ids: string[];
  integration_ids: string[];
}) {
  for (const id of input.schedule_ids) {
    await deleteSchedule({
      workspace_slug: input.workspace_slug,
      schedule_id: id,
    }).catch(() => {});
  }
  for (const id of input.agent_ids) {
    await archiveAgent({
      workspace_slug: input.workspace_slug,
      business_id: input.business_id,
      id,
    }).catch(() => {});
  }
  for (const id of input.integration_ids) {
    await deleteIntegration({
      workspace_slug: input.workspace_slug,
      business_id: input.business_id ?? undefined,
      id,
    }).catch(() => {});
  }
  for (const id of input.skill_ids) {
    await archiveSkill({ workspace_slug: input.workspace_slug, id }).catch(() => {});
  }
  if (input.business_id) {
    await archiveBusiness({
      workspace_slug: input.workspace_slug,
      id: input.business_id,
    }).catch(() => {});
  }
}

export async function createFlow(input: CreateFlowInput): Promise<CreateFlowResult> {
  const { workspace_slug, workspace_id, business_id, plan } = input;
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  if (!plan.agent.name.trim()) {
    return { ok: false, error: "Agentnaam mag niet leeg zijn." };
  }
  if (!plan.agent.system_prompt.trim()) {
    return { ok: false, error: "System prompt mag niet leeg zijn." };
  }
  if (providerNeedsApiKey(plan.agent.provider)) {
    let credentialOwnerUserId = user.id;
    if (plan.schedule?.kind === "cron" || plan.schedule?.kind === "webhook") {
      const supabase = await createSupabaseServerClient();
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("owner_id")
        .eq("id", workspace_id)
        .maybeSingle();
      credentialOwnerUserId = workspace?.owner_id ?? user.id;
    }
    const apiKey = await resolveApiKey(plan.agent.provider, {
      workspaceId: workspace_id,
      businessId: business_id,
      credentialOwnerUserId,
    });
    if (!apiKey) {
      return {
        ok: false,
        error: `${providerLabel(plan.agent.provider)} API key ontbreekt voor deze flow. Kies een geconfigureerde provider of voeg de key toe bij Settings → API Keys.`,
      };
    }
  }

  for (const [idx, skill] of plan.skills.entries()) {
    if (!skill.name.trim() || !skill.description.trim() || !skill.body.trim()) {
      return {
        ok: false,
        error: `Skill ${idx + 1} is niet compleet. Naam, beschrijving en body zijn verplicht.`,
      };
    }
  }

  // ── 1. Create agent ───────────────────────────────────────────────
  const agentResult = await createAgent({
    workspace_slug,
    workspace_id,
    business_id,
    name: plan.agent.name,
    kind: plan.agent.kind,
    provider: plan.agent.provider,
    model: plan.agent.model,
    systemPrompt: plan.agent.system_prompt,
    key_source: "env",
  });
  if (!agentResult.ok) return { ok: false, error: `Agent aanmaken mislukt: ${agentResult.error}` };
  const agent_id = agentResult.data.id;

  // ── 2. Create skills (if any) ─────────────────────────────────────
  const skill_ids: string[] = [];
  for (const skillPlan of plan.skills) {
    const skillResult = await createSkill({
      workspace_slug,
      workspace_id,
      name: skillPlan.name,
      description: skillPlan.description,
      body: skillPlan.body,
    });
    if (!skillResult.ok) {
      await rollback(workspace_slug, business_id, agent_id, skill_ids);
      return { ok: false, error: `Skill "${skillPlan.name}" aanmaken mislukt: ${skillResult.error}` };
    }
    skill_ids.push(skillResult.data.id);
  }

  // ── 3. Attach skills to agent ─────────────────────────────────────
  if (skill_ids.length > 0) {
    const setResult = await setAgentSkills({
      workspace_slug,
      business_id,
      agent_id,
      skill_ids,
    });
    if (!setResult.ok) {
      await rollback(workspace_slug, business_id, agent_id, skill_ids);
      return { ok: false, error: `Skills koppelen mislukt: ${setResult.error}` };
    }
  }

  // ── 4. Create schedule (if any) ───────────────────────────────────
  let schedule_id: string | undefined;
  let schedule_kind: NonNullable<FlowPlan["schedule"]>["kind"] | undefined;
  let webhook_secret: string | undefined;
  let webhook_url: string | undefined;
  if (plan.schedule) {
    const sched = plan.schedule;
    schedule_kind = sched.kind;

    if (sched.kind === "cron") {
      const hdrs = await headers();
      const proto = hdrs.get("x-forwarded-proto") ?? "http";
      const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3010";
      const callback_origin =
        process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;

      const schedResult = await createCronSchedule({
        workspace_slug,
        workspace_id,
        agent_id,
        business_id,
        cron_expr: sched.cron_expr ?? "0 9 * * *",
        prompt: sched.prompt,
        title: sched.title,
        description: sched.description,
        callback_origin,
      });
      if (!schedResult.ok) {
        await rollback(workspace_slug, business_id, agent_id, skill_ids);
        return { ok: false, error: `Schedule aanmaken mislukt: ${schedResult.error}` };
      }
      schedule_id = schedResult.data.id;
    } else if (sched.kind === "webhook") {
      const hdrs = await headers();
      const proto = hdrs.get("x-forwarded-proto") ?? "http";
      const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3010";
      const trigger_origin =
        process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;
      const schedResult = await createWebhookSchedule({
        workspace_slug,
        workspace_id,
        agent_id,
        business_id,
        title: sched.title,
        description: sched.description,
        instructions: sched.prompt,
      });
      if (!schedResult.ok) {
        await rollback(workspace_slug, business_id, agent_id, skill_ids);
        return { ok: false, error: `Webhook aanmaken mislukt: ${schedResult.error}` };
      }
      schedule_id = schedResult.data.id;
      webhook_secret = schedResult.data.secret;
      webhook_url = `${trigger_origin}/api/triggers/${schedResult.data.secret}`;
    } else if (sched.kind === "manual") {
      const schedResult = await createManualSchedule({
        workspace_slug,
        workspace_id,
        agent_id,
        business_id,
        title: sched.title,
        description: sched.description,
        instructions: sched.prompt,
      });
      if (!schedResult.ok) {
        await rollback(workspace_slug, business_id, agent_id, skill_ids);
        return { ok: false, error: `Manual schedule aanmaken mislukt: ${schedResult.error}` };
      }
      schedule_id = schedResult.data.id;
    }
  }

  revalidatePath(`/${workspace_slug}/agents`);
  if (business_id) {
    revalidatePath(`/${workspace_slug}/business/${business_id}/schedules`);
    revalidatePath(`/${workspace_slug}/business/${business_id}/agents`);
  }
  revalidatePath(`/${workspace_slug}/flows`);

  return {
    ok: true,
    data: {
      agent_id,
      schedule_id,
      schedule_kind,
      webhook_secret,
      webhook_url,
      skill_ids,
    },
  };
}

export async function createBusinessBlueprint(
  input: CreateBusinessBlueprintInput,
): Promise<CreateBusinessBlueprintResult> {
  const { workspace_slug, workspace_id, plan } = input;
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const validationError = validateBusinessBlueprint(plan);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspace_id)
    .maybeSingle();
  const credentialOwnerUserId = workspace?.owner_id ?? user.id;

  for (const agent of plan.agents) {
    if (!providerNeedsApiKey(agent.provider)) continue;
    const apiKey = await resolveApiKey(agent.provider, {
      workspaceId: workspace_id,
      businessId: null,
      credentialOwnerUserId,
    });
    if (!apiKey) {
      return {
        ok: false,
        error: `${providerLabel(agent.provider)} API key ontbreekt voor agent "${agent.name}". Voeg de key toe bij Settings -> API Keys of wijzig de provider naar Ollama.`,
      };
    }
  }

  const createdAgentIds: string[] = [];
  const createdSkillIds: string[] = [];
  const createdTopicIds: string[] = [];
  const createdScheduleIds: string[] = [];
  const createdIntegrationIds: string[] = [];
  const webhookUrls: Array<{ schedule_id: string; url: string }> = [];
  let businessId: string | null = null;
  let businessSlug = "";

  try {
    const businessResult = await createBusiness({
      workspace_slug,
      workspace_id,
      name: plan.business.name,
      sub: plan.business.sub,
      description: plan.business.description,
      mission: plan.business.mission,
      icon: plan.business.icon ?? undefined,
      letter: plan.business.icon || plan.business.name,
      variant: "brand",
      isolated: false,
    });
    if (!businessResult.ok) {
      return {
        ok: false,
        error: `Business aanmaken mislukt: ${businessResult.error}`,
      };
    }
    businessId = businessResult.data.id;
    businessSlug = businessResult.data.slug;

    const topicIdsByKey = new Map<string, string>();
    const pendingTopics = [...plan.topics];
    let safety = pendingTopics.length + 5;
    while (pendingTopics.length > 0 && safety > 0) {
      safety -= 1;
      let progressed = false;
      for (let i = pendingTopics.length - 1; i >= 0; i -= 1) {
        const topic = pendingTopics[i];
        if (!topic) continue;
        const parentId = topic.parent_key
          ? topicIdsByKey.get(topic.parent_key)
          : null;
        if (topic.parent_key && !parentId) continue;
        const topicResult = await createNavNode({
          workspace_slug,
          workspace_id,
          business_id: businessId,
          parent_id: parentId ?? null,
          name: topic.name,
          icon: topic.icon ?? undefined,
          variant: "slate",
        });
        if (!topicResult.ok) {
          throw new Error(`Topic "${topic.name}" aanmaken mislukt: ${topicResult.error}`);
        }
        topicIdsByKey.set(topic.key, topicResult.data.id);
        createdTopicIds.push(topicResult.data.id);
        pendingTopics.splice(i, 1);
        progressed = true;
      }
      if (!progressed) break;
    }
    for (const topic of pendingTopics) {
      const topicResult = await createNavNode({
        workspace_slug,
        workspace_id,
        business_id: businessId,
        parent_id: null,
        name: topic.name,
        icon: topic.icon ?? undefined,
        variant: "slate",
      });
      if (!topicResult.ok) {
        throw new Error(`Topic "${topic.name}" aanmaken mislukt: ${topicResult.error}`);
      }
      topicIdsByKey.set(topic.key, topicResult.data.id);
      createdTopicIds.push(topicResult.data.id);
    }

    const skillIdsByKey = new Map<string, string>();
    for (const skill of plan.skills) {
      const skillResult = await createSkill({
        workspace_slug,
        workspace_id,
        name: skill.name,
        description: skill.description,
        body: skill.body,
      });
      if (!skillResult.ok) {
        throw new Error(`Skill "${skill.name}" aanmaken mislukt: ${skillResult.error}`);
      }
      skillIdsByKey.set(skill.key, skillResult.data.id);
      createdSkillIds.push(skillResult.data.id);
    }

    for (const integration of plan.integrations) {
      const integrationResult = await createIntegration({
        workspace_slug,
        workspace_id,
        business_id: businessId,
        provider: integration.provider,
        name: integration.name,
      });
      if (!integrationResult.ok) {
        throw new Error(
          `Integration "${integration.name}" aanmaken mislukt: ${integrationResult.error}`,
        );
      }
      createdIntegrationIds.push(integrationResult.data.id);
    }

    const agentIdsByKey = new Map<string, string>();
    for (const agent of plan.agents) {
      const agentResult = await createAgent({
        workspace_slug,
        workspace_id,
        business_id: businessId,
        name: agent.name,
        kind: agent.kind,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: [
          agent.system_prompt,
          agent.description ? `\n\nBusiness role: ${agent.description}` : "",
          plan.team?.notes ? `\n\nTeam operating notes: ${plan.team.notes}` : "",
        ].join(""),
        key_source: "env",
        nav_node_id: agent.topic_key
          ? topicIdsByKey.get(agent.topic_key) ?? null
          : null,
        mcpServers:
          (agent.mcp_servers ?? []).length > 0 ? agent.mcp_servers : undefined,
        mcpPermissions: mcpPermissionsFor(agent),
      });
      if (!agentResult.ok) {
        throw new Error(`Agent "${agent.name}" aanmaken mislukt: ${agentResult.error}`);
      }
      agentIdsByKey.set(agent.key, agentResult.data.id);
      createdAgentIds.push(agentResult.data.id);

      const skillIds = agent.skill_keys
        .map((skillKey) => skillIdsByKey.get(skillKey))
        .filter((id): id is string => Boolean(id));
      if (skillIds.length > 0) {
        const setResult = await setAgentSkills({
          workspace_slug,
          business_id: businessId,
          agent_id: agentResult.data.id,
          skill_ids: skillIds,
        });
        if (!setResult.ok) {
          throw new Error(`Skills koppelen aan "${agent.name}" mislukt: ${setResult.error}`);
        }
      }
    }

    for (const agent of plan.agents) {
      const agentId = agentIdsByKey.get(agent.key);
      if (!agentId) continue;
      const nextDone = agent.handoff_on_done_key
        ? agentIdsByKey.get(agent.handoff_on_done_key) ?? null
        : null;
      const nextFail = agent.handoff_on_fail_key
        ? agentIdsByKey.get(agent.handoff_on_fail_key) ?? null
        : null;
      if (!nextDone && !nextFail) continue;
      const updateResult = await updateAgent({
        workspace_slug,
        business_id: businessId,
        id: agentId,
        patch: {
          next_agent_on_done: nextDone,
          next_agent_on_fail: nextFail,
        },
      });
      if (!updateResult.ok) {
        throw new Error(`Agent handoff voor "${agent.name}" mislukt: ${updateResult.error}`);
      }
    }

    const hdrs = await headers();
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3010";
    const origin = process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;

    for (const schedule of plan.schedules) {
      const agentId = agentIdsByKey.get(schedule.agent_key);
      if (!agentId) continue;
      const navNodeId = schedule.topic_key
        ? topicIdsByKey.get(schedule.topic_key) ?? null
        : null;

      if (schedule.kind === "cron") {
        const schedResult = await createCronSchedule({
          workspace_slug,
          workspace_id,
          agent_id: agentId,
          business_id: businessId,
          nav_node_id: navNodeId,
          cron_expr: schedule.cron_expr ?? "0 9 * * *",
          prompt: schedule.prompt,
          title: schedule.title,
          description: schedule.description,
          callback_origin: origin,
        });
        if (!schedResult.ok) {
          throw new Error(
            `Cron schedule "${schedule.title}" aanmaken mislukt: ${schedResult.error}`,
          );
        }
        createdScheduleIds.push(schedResult.data.id);
      } else if (schedule.kind === "webhook") {
        const schedResult = await createWebhookSchedule({
          workspace_slug,
          workspace_id,
          agent_id: agentId,
          business_id: businessId,
          nav_node_id: navNodeId,
          title: schedule.title,
          description: schedule.description,
          instructions: schedule.prompt,
        });
        if (!schedResult.ok) {
          throw new Error(
            `Webhook "${schedule.title}" aanmaken mislukt: ${schedResult.error}`,
          );
        }
        createdScheduleIds.push(schedResult.data.id);
        webhookUrls.push({
          schedule_id: schedResult.data.id,
          url: `${origin}/api/triggers/${schedResult.data.secret}`,
        });
      } else {
        const schedResult = await createManualSchedule({
          workspace_slug,
          workspace_id,
          agent_id: agentId,
          business_id: businessId,
          nav_node_id: navNodeId,
          title: schedule.title,
          description: schedule.description,
          instructions: schedule.prompt,
        });
        if (!schedResult.ok) {
          throw new Error(
            `Manual schedule "${schedule.title}" aanmaken mislukt: ${schedResult.error}`,
          );
        }
        createdScheduleIds.push(schedResult.data.id);
      }
    }
  } catch (err) {
    await rollbackBusinessBlueprint({
      workspace_slug,
      business_id: businessId,
      agent_ids: createdAgentIds,
      skill_ids: createdSkillIds,
      schedule_ids: createdScheduleIds,
      integration_ids: createdIntegrationIds,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Business blueprint aanmaken mislukt.",
    };
  }

  revalidatePath(`/${workspace_slug}/dashboard`);
  if (businessId) {
    revalidatePath(`/${workspace_slug}/business/${businessSlug || businessId}`, "layout");
  }
  revalidatePath(`/${workspace_slug}/agents`);
  revalidatePath(`/${workspace_slug}/flows`);

  if (!businessId) {
    return { ok: false, error: "Business blueprint aanmaken mislukt." };
  }

  return {
    ok: true,
    data: {
      business_id: businessId,
      business_slug: businessSlug,
      topic_ids: createdTopicIds,
      agent_ids: createdAgentIds,
      schedule_ids: createdScheduleIds,
      integration_ids: createdIntegrationIds,
      skill_ids: createdSkillIds,
      webhook_urls: webhookUrls,
    },
  };
}
