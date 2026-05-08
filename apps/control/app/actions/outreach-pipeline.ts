"use server";

import { revalidatePath } from "next/cache";

import {
  generatePipelineBlueprintPlan,
  type FlowPlanProvider,
} from "@aio/ai/flow-planner";

import {
  resolveApiKey,
  resolveApiKeyEnvFallback,
} from "../../lib/api-keys/resolve";
import { runOutreachPipelineCycle } from "../../lib/outreach/pipeline-runner";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export type OutreachPipelineActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type ConfigPatch = {
  workspace_slug: string;
  business_slug: string;
  workspace_id: string;
  business_id: string;
  nav_node_id?: string | null;
  enabled?: boolean;
  interval_seconds?: number;
  batch_size?: number;
  pipeline_steps?: unknown;
  pipeline_blueprint?: unknown;
};

type ConfigLite = {
  id: string;
  enabled: boolean;
  interval_seconds: number;
  batch_size: number;
};

type PipelineAgentOption = {
  id: string;
  name: string;
  kind?: string;
  provider?: string;
  model?: string | null;
};

export async function updateOutreachPipelineConfig(
  input: ConfigPatch,
): Promise<OutreachPipelineActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const existing = await getExistingConfig(
    supabase,
    input.workspace_id,
    input.business_id,
    input.nav_node_id ?? null,
  );

  const patch = {
    workspace_id: input.workspace_id,
    business_id: input.business_id,
    nav_node_id: input.nav_node_id ?? null,
    enabled: input.enabled ?? existing?.enabled ?? false,
    interval_seconds:
      input.interval_seconds !== undefined
        ? clampInt(input.interval_seconds, 5, 3600)
        : (existing?.interval_seconds ?? 10),
    batch_size:
      input.batch_size !== undefined
        ? clampInt(input.batch_size, 1, 25)
        : (existing?.batch_size ?? 3),
    delivery_mode: "local_outbox",
    pipeline_steps:
      input.pipeline_steps !== undefined
        ? sanitizePipelineSteps(input.pipeline_steps)
        : undefined,
    pipeline_blueprint:
      input.pipeline_blueprint !== undefined
        ? sanitizePipelineBlueprint(input.pipeline_blueprint)
        : undefined,
  };

  const query = existing
    ? supabase
        .from("outreach_pipeline_configs")
        .update(patch)
        .eq("id", existing.id)
        .select("id")
        .single()
    : supabase
        .from("outreach_pipeline_configs")
        .insert(patch)
        .select("id")
        .single();

  const { data, error } = await query;
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Config opslaan mislukt." };
  }

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_slug}/outreach-pipeline`,
  );
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_slug}/pipelines`,
  );
  return { ok: true, data: { id: data.id as string } };
}

export async function runOutreachPipelineNow(input: {
  workspace_slug: string;
  business_slug: string;
  workspace_id: string;
  business_id: string;
  nav_node_id?: string | null;
}): Promise<
  OutreachPipelineActionResult<{
    claimed: number;
    outreached: number;
    duplicates: number;
    errors: number;
  }>
> {
  const config = await updateOutreachPipelineConfig({
    ...input,
  });
  if (!config.ok) return config;

  const result = await runOutreachPipelineCycle(config.data.id, {
    force: true,
  });

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_slug}/outreach-pipeline`,
  );
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_slug}/pipelines`,
  );

  if (!result.ok && result.status === "failed") {
    return {
      ok: false,
      error: result.error ?? "Pipeline run mislukt.",
    };
  }

  return {
    ok: true,
    data: {
      claimed: result.claimed,
      outreached: result.outreached,
      duplicates: result.duplicates,
      errors: result.errors,
    },
  };
}

async function getExistingConfig(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  businessId: string,
  navNodeId: string | null,
): Promise<ConfigLite | null> {
  let query = supabase
    .from("outreach_pipeline_configs")
    .select("id, enabled, interval_seconds, batch_size")
    .eq("workspace_id", workspaceId)
    .eq("business_id", businessId);
  query = navNodeId ? query.eq("nav_node_id", navNodeId) : query.is("nav_node_id", null);
  const { data } = await query.maybeSingle();
  return (data as ConfigLite | null) ?? null;
}

export async function generateOutreachPipelineBlueprint(input: {
  workspace_id: string;
  business_id: string;
  nav_node_id?: string | null;
  scope_name?: string;
  description: string;
  agents?: PipelineAgentOption[];
}): Promise<OutreachPipelineActionResult<ReturnType<typeof sanitizeSingleBlueprint>>> {
  const description = cleanText(input.description, "");
  if (!description) {
    return { ok: false, error: "Beschrijving is verplicht." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;

  let apiKey: string | null = null;
  let provider: FlowPlanProvider = "claude";
  if (userId) {
    apiKey = await resolveApiKey("claude", {
      workspaceId: input.workspace_id,
      businessId: input.business_id,
      credentialOwnerUserId: userId,
    });
  }
  if (!apiKey) apiKey = resolveApiKeyEnvFallback("claude");
  if (!apiKey) {
    if (userId) {
      apiKey = await resolveApiKey("minimax", {
        workspaceId: input.workspace_id,
        businessId: input.business_id,
        credentialOwnerUserId: userId,
      });
    }
    if (!apiKey) apiKey = resolveApiKeyEnvFallback("minimax");
    if (apiKey) provider = "minimax";
  }

  if (!apiKey) {
    return {
      ok: false,
      error:
        "Geen Claude of MiniMax API key gevonden. Voeg een key toe via Settings -> API Keys.",
    };
  }

  try {
    const plan = await generatePipelineBlueprintPlan(
      {
        description,
        scopeName: input.scope_name,
        availableAgents: input.agents ?? [],
      },
      apiKey,
      provider,
    );
    return {
      ok: true,
      data: sanitizeSingleBlueprint(
        {
          ...plan,
          pipeline_id:
            plan.pipeline_id || `pipeline_${Date.now().toString(36)}`,
          orchestrator_agent_id:
            plan.orchestrator_agent_id ??
            pickOrchestratorAgentId(input.agents ?? []),
        },
        0,
      ),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Pipeline genereren mislukt.",
    };
  }
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitizePipelineSteps(value: unknown): Array<{
  id: string;
  label: string;
  agent: string;
  task: string;
  handoff: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).map((raw, index) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const id = cleanText(row.id, `step_${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .slice(0, 48);
    return {
      id,
      label: cleanText(row.label, `Stap ${index + 1}`).slice(0, 80),
      agent: cleanText(row.agent, "Agent").slice(0, 80),
      task: cleanText(row.task, "Taak uitvoeren").slice(0, 180),
      handoff: cleanText(row.handoff, "Output doorgeven").slice(0, 180),
    };
  });
}

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function sanitizePipelineBlueprint(value: unknown): {
  active_pipeline_id: string;
  pipelines: Array<{
    pipeline_id: string;
    pipeline_name: string;
    orchestrator_agent_id: string | null;
    learning_enabled: boolean;
    correction_rules: string[];
    steps: ReturnType<typeof sanitizePipelineSteps>;
  }>;
  pipeline_id: string;
  pipeline_name: string;
  orchestrator_agent_id: string | null;
  learning_enabled: boolean;
  correction_rules: string[];
  steps: ReturnType<typeof sanitizePipelineSteps>;
} {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pipelines = Array.isArray(row.pipelines)
    ? row.pipelines.map((item, index) => sanitizeSingleBlueprint(item, index))
    : [];
  const hasExplicitPipelines = Array.isArray(row.pipelines);
  const fallback = sanitizeSingleBlueprint(row, 0);
  const safePipelines = hasExplicitPipelines
    ? pipelines.slice(0, 20)
    : [fallback];
  if (safePipelines.length === 0) {
    return {
      active_pipeline_id: "",
      pipelines: [],
      pipeline_id: "",
      pipeline_name: "",
      orchestrator_agent_id: null,
      learning_enabled: true,
      correction_rules: [],
      steps: [],
    };
  }
  const activeId =
    typeof row.active_pipeline_id === "string" &&
    safePipelines.some((pipeline) => pipeline.pipeline_id === row.active_pipeline_id)
      ? row.active_pipeline_id
      : safePipelines[0]?.pipeline_id ?? "pipeline_1";
  const active = safePipelines.find((pipeline) => pipeline.pipeline_id === activeId) ?? safePipelines[0] ?? fallback;
  return {
    active_pipeline_id: active.pipeline_id,
    pipelines: safePipelines,
    ...active,
  };
}

function pickOrchestratorAgentId(agents: PipelineAgentOption[]): string | null {
  return (
    agents.find((agent) => agent.kind === "router")?.id ??
    agents.find((agent) => agent.kind === "reviewer")?.id ??
    agents[0]?.id ??
    null
  );
}

function sanitizeSingleBlueprint(value: unknown, index: number): {
  pipeline_id: string;
  pipeline_name: string;
  orchestrator_agent_id: string | null;
  learning_enabled: boolean;
  correction_rules: string[];
  steps: ReturnType<typeof sanitizePipelineSteps>;
} {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pipelineId = cleanText(row.pipeline_id, `pipeline_${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 48);
  const orchestrator =
    typeof row.orchestrator_agent_id === "string" &&
    /^[0-9a-f-]{20,}$/i.test(row.orchestrator_agent_id)
      ? row.orchestrator_agent_id
      : null;
  const rules = Array.isArray(row.correction_rules)
    ? row.correction_rules
        .map((item) => cleanText(item, ""))
        .filter(Boolean)
        .slice(0, 20)
        .map((item) => item.slice(0, 220))
    : [];
  const steps = sanitizePipelineSteps(
    Array.isArray(row.steps) ? row.steps : [],
  ).map((step, index) => {
    const raw = Array.isArray(row.steps) ? row.steps[index] : null;
    const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return {
      ...step,
      provider: cleanText(obj.provider, "openai_codex").slice(0, 40),
      model: cleanText(obj.model, "").slice(0, 120),
      agent_id:
        typeof obj.agent_id === "string" && /^[0-9a-f-]{20,}$/i.test(obj.agent_id)
          ? obj.agent_id
          : null,
      context_policy: cleanText(obj.context_policy, "handoff_only").slice(0, 40),
      needs: cleanText(obj.needs, step.task).slice(0, 220),
      qa_rule: cleanText(obj.qa_rule, "Orchestrator controleert output.").slice(0, 220),
      positive_prompt: cleanText(
        obj.positive_prompt,
        "Doe precies wat de orchestrator vraagt en lever compact bewijs.",
      ).slice(0, 500),
      negative_prompt: cleanText(
        obj.negative_prompt,
        "Geen aannames, geen brede context ophalen, geen externe actie uitvoeren.",
      ).slice(0, 500),
    };
  });
  return {
    pipeline_id: pipelineId,
    pipeline_name: cleanText(row.pipeline_name, index === 0 ? "Main pipeline" : `Pipeline ${index + 1}`).slice(0, 80),
    orchestrator_agent_id: orchestrator,
    learning_enabled: row.learning_enabled !== false,
    correction_rules: rules,
    steps,
  };
}
