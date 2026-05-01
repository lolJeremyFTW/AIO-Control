// Server-side worker that picks up a queued run row, executes the agent
// via the provider router, and persists the output back. Used by:
//   - runAgentNow server action ("Run now" button)
//   - /api/triggers/[secret] webhook
//   - /api/runs/[run_id]/dispatch (manual re-run / debug)
//
// We don't stream events here — the queued path is fire-and-forget. For
// interactive chat, /api/chat/[agent_id] is the streaming path.

import "server-only";

import {
  streamChat,
  type AgentConfig,
  type ProviderId,
} from "@aio/ai/router";
import type { ChatMessage } from "@aio/ai/ag-ui";

import { getServiceRoleSupabase } from "../supabase/service";

type DispatchResult = {
  ok: boolean;
  status: "done" | "failed" | "deferred";
  error?: string;
  cost_cents?: number;
  output_text?: string;
};

const DEFER_REASONS = {
  business_paused: "Business is paused",
  agent_archived: "Agent is archived",
} as const;

export async function dispatchRun(runId: string): Promise<DispatchResult> {
  const supabase = getServiceRoleSupabase();

  // Pull the run + agent + business in one round-trip via PostgREST.
  const { data: run, error: runErr } = await supabase
    .from("runs")
    .select(
      `id, workspace_id, agent_id, business_id, input, status,
       agents:agent_id ( id, name, provider, model, config, archived_at ),
       businesses:business_id ( id, status )`,
    )
    .eq("id", runId)
    .maybeSingle();

  if (runErr || !run) {
    return { ok: false, status: "failed", error: runErr?.message ?? "run not found" };
  }
  if (run.status === "done" || run.status === "failed") {
    return { ok: true, status: run.status as "done" | "failed" };
  }

  type AgentRow = {
    id: string;
    name: string;
    provider: string;
    model: string | null;
    config: Record<string, unknown> | null;
    archived_at: string | null;
  };
  type BizRow = { id: string; status: string };

  const agent = run.agents as unknown as AgentRow | null;
  const business = run.businesses as unknown as BizRow | null;

  if (!agent) {
    return await markFailed(runId, "agent missing");
  }
  if (agent.archived_at) {
    return await markFailed(runId, DEFER_REASONS.agent_archived);
  }
  if (business && business.status === "paused") {
    // We keep the row queued so a future run-now / unpause picks it up.
    return { ok: true, status: "deferred", error: DEFER_REASONS.business_paused };
  }

  // Promote to running so concurrent dispatchers don't double-execute.
  const startedAt = new Date().toISOString();
  await supabase
    .from("runs")
    .update({ status: "running", started_at: startedAt })
    .eq("id", runId);

  // Build the message list. The webhook payload shape and the manual
  // "Run now" payload both come through run.input — accept both shapes.
  const input = (run.input ?? {}) as { prompt?: string; payload?: unknown; messages?: ChatMessage[] };
  const messages: ChatMessage[] = input.messages
    ? input.messages
    : [
        {
          role: "user",
          content:
            input.prompt ??
            (input.payload ? JSON.stringify(input.payload) : "(no input)"),
        },
      ];

  const config = (agent.config ?? {}) as AgentConfig;
  if (agent.model && !config.model) config.model = agent.model;

  let output = "";
  let cost = 0;
  let errorText: string | null = null;

  try {
    for await (const event of streamChat({
      provider: agent.provider as ProviderId,
      config,
      messages,
      runId,
    })) {
      if (event.type === "token") output += event.delta;
      else if (event.type === "message_end") cost = event.usage.cost_cents;
      else if (event.type === "error") errorText = event.message;
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : "dispatch error";
  }

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - new Date(startedAt).getTime();
  const finalStatus = errorText ? "failed" : "done";

  await supabase
    .from("runs")
    .update({
      status: finalStatus,
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
      cost_cents: cost,
      output: { text: output },
      error_text: errorText,
    })
    .eq("id", runId);

  return {
    ok: !errorText,
    status: finalStatus,
    error: errorText ?? undefined,
    cost_cents: cost,
    output_text: output,
  };
}

async function markFailed(runId: string, reason: string): Promise<DispatchResult> {
  const supabase = getServiceRoleSupabase();
  await supabase
    .from("runs")
    .update({
      status: "failed",
      ended_at: new Date().toISOString(),
      error_text: reason,
    })
    .eq("id", runId);
  return { ok: false, status: "failed", error: reason };
}
