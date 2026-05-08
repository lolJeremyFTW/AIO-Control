"use server";

import { revalidatePath } from "next/cache";

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
  enabled?: boolean;
  interval_seconds?: number;
  batch_size?: number;
};

type ConfigLite = {
  id: string;
  enabled: boolean;
  interval_seconds: number;
  batch_size: number;
};

export async function updateOutreachPipelineConfig(
  input: ConfigPatch,
): Promise<OutreachPipelineActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const existing = await getExistingConfig(
    supabase,
    input.workspace_id,
    input.business_id,
  );

  const patch = {
    workspace_id: input.workspace_id,
    business_id: input.business_id,
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
  return { ok: true, data: { id: data.id as string } };
}

export async function runOutreachPipelineNow(input: {
  workspace_slug: string;
  business_slug: string;
  workspace_id: string;
  business_id: string;
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
): Promise<ConfigLite | null> {
  const { data } = await supabase
    .from("outreach_pipeline_configs")
    .select("id, enabled, interval_seconds, batch_size")
    .eq("workspace_id", workspaceId)
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as ConfigLite | null) ?? null;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
