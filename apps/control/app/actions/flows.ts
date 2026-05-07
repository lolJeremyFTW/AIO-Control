// Server action that creates an entire flow in one shot:
// agent → skills → schedule (in that order so IDs are available for linking).

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createAgent, archiveAgent } from "./agents";
import { createSkill, archiveSkill, setAgentSkills } from "./skills";
import { createCronSchedule, createWebhookSchedule, createManualSchedule } from "./schedules";
import { getCurrentUser } from "../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { resolveApiKey } from "../../lib/api-keys/resolve";
import type { FlowPlan } from "@aio/ai/flow-planner";

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

function providerNeedsApiKey(provider: FlowPlan["agent"]["provider"]) {
  return provider !== "ollama";
}

function providerLabel(provider: FlowPlan["agent"]["provider"]) {
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
