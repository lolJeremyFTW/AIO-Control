// Server action that creates an entire flow in one shot:
// agent → skills → schedule (in that order so IDs are available for linking).

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createAgent, archiveAgent } from "./agents";
import { createSkill, archiveSkill, setAgentSkills } from "./skills";
import { createCronSchedule, createWebhookSchedule, createManualSchedule } from "./schedules";
import type { FlowPlan } from "@aio/ai/flow-planner";

export type CreateFlowInput = {
  workspace_slug: string;
  workspace_id: string;
  business_id: string | null;
  plan: FlowPlan;
};

export type CreateFlowResult =
  | { ok: true; data: { agent_id: string; schedule_id?: string; skill_ids: string[] } }
  | { ok: false; error: string };

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
  if (plan.schedule) {
    const sched = plan.schedule;

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
      const schedResult = await createWebhookSchedule({
        workspace_slug,
        workspace_id,
        agent_id,
        business_id,
      });
      if (!schedResult.ok) {
        await rollback(workspace_slug, business_id, agent_id, skill_ids);
        return { ok: false, error: `Webhook aanmaken mislukt: ${schedResult.error}` };
      }
      schedule_id = schedResult.data.id;
    } else if (sched.kind === "manual") {
      const schedResult = await createManualSchedule({
        workspace_slug,
        workspace_id,
        agent_id,
        business_id,
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

  return { ok: true, data: { agent_id, schedule_id, skill_ids } };
}
