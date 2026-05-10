import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";

type ProviderUsageInput = {
  workspaceId: string;
  businessId?: string | null;
  navNodeId?: string | null;
  agentId?: string | null;
  scheduleId?: string | null;
  runId?: string | null;
  provider: string;
  model?: string | null;
  triggeredBy?: string | null;
  status: "done" | "failed";
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  latencyMs?: number | null;
  errorText?: string | null;
};

export async function recordProviderUsage(
  input: ProviderUsageInput,
): Promise<void> {
  const supabase = getServiceRoleSupabase();
  const payload = {
    workspace_id: input.workspaceId,
    business_id: input.businessId ?? null,
    nav_node_id: input.navNodeId ?? null,
    agent_id: input.agentId ?? null,
    schedule_id: input.scheduleId ?? null,
    run_id: input.runId ?? null,
    provider: input.provider,
    model: input.model ?? null,
    triggered_by: input.triggeredBy ?? null,
    status: input.status,
    input_tokens: Math.max(0, Math.trunc(input.inputTokens ?? 0)),
    output_tokens: Math.max(0, Math.trunc(input.outputTokens ?? 0)),
    cost_cents: Math.max(0, Math.trunc(input.costCents ?? 0)),
    latency_ms:
      input.latencyMs == null ? null : Math.max(0, Math.trunc(input.latencyMs)),
    error_text: input.errorText ?? null,
    recorded_at: new Date().toISOString(),
  };

  const query = input.runId
    ? supabase
        .from("provider_usage")
        .upsert(payload, { onConflict: "run_id" })
    : supabase.from("provider_usage").insert(payload);

  const { error } = await query;
  if (error) {
    console.warn("[provider-usage] record failed", error);
  }
}
