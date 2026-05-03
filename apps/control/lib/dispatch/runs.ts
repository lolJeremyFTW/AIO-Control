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

import { resolveOllamaEndpoint } from "../ollama/endpoint";
import {
  buildAgentSystemPrompt,
  prependPreamble,
} from "../agents/business-context";
import { checkSpendLimit } from "./spend-limit";
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
       agents:agent_id ( id, name, provider, model, config, archived_at, next_agent_on_done, next_agent_on_fail ),
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
    next_agent_on_done: string | null;
    next_agent_on_fail: string | null;
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

  // Check spend limits before we even start. If we're over the daily
  // or monthly cap we mark failed with a clear error and (per the
  // workspace flag) auto-pause the business so future triggers don't
  // pile up.
  if (business) {
    const limit = await checkSpendLimit(business.id);
    if (!limit.ok) {
      const reason =
        limit.reason === "daily_exceeded"
          ? `Daily spend limit (€${(limit.limit_cents / 100).toFixed(2)}) reached — current €${(limit.current_cents / 100).toFixed(2)}.`
          : `Monthly spend limit (€${(limit.limit_cents / 100).toFixed(2)}) reached — current €${(limit.current_cents / 100).toFixed(2)}.`;
      const suffix = limit.auto_paused ? " Business auto-gepauzeerd." : "";
      return await markFailed(runId, reason + suffix);
    }
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

  // Inject the same system-prompt preamble we use for chat — platform
  // identity, business context, integrations, siblings, budget. This
  // is the fix for the "agents have no idea what system they're in"
  // bug: previously cron/webhook/manual dispatchers ran agents blind
  // because they skipped this step entirely.
  const preamble = await buildAgentSystemPrompt({
    id: agent.id,
    workspace_id: run.workspace_id,
    business_id: run.business_id,
    name: agent.name,
    kind: "worker", // dispatched runs default to worker semantics
    provider: agent.provider,
    model: agent.model,
  });
  config.systemPrompt = prependPreamble(
    preamble,
    config.systemPrompt as string | null | undefined,
  );

  let output = "";
  let cost = 0;
  let errorText: string | null = null;

  // Resolve workspace-level Ollama endpoint so a scheduled / webhook
  // / manual run hits the same box as the chat panel does. Cheap;
  // single row read, no-op when the workspace hasn't configured one.
  const ollamaEndpoint = await resolveOllamaEndpoint(run.workspace_id);

  try {
    for await (const event of streamChat({
      provider: agent.provider as ProviderId,
      config,
      messages,
      runId,
      tenant: {
        workspaceId: run.workspace_id,
        businessId: run.business_id,
        ollamaEndpoint,
      },
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

  // On failure, schedule the next retry with exponential backoff:
  //   attempt 1 → 1 min, 2 → 4 min, 3 → 16 min (cap 1 hour)
  // Only retry transient errors — explicit "permission denied" /
  // "missing key" / "invalid model" failures get no retry because
  // they'll just fail again.
  let nextRetryAt: string | null = null;
  if (errorText && isTransientError(errorText)) {
    const { data: row } = await supabase
      .from("runs")
      .select("attempt, max_attempts")
      .eq("id", runId)
      .maybeSingle();
    const attempt = (row?.attempt as number | undefined) ?? 1;
    const maxAttempts = (row?.max_attempts as number | undefined) ?? 3;
    if (attempt < maxAttempts) {
      const delayMs = Math.min(60_000 * Math.pow(4, attempt - 1), 3_600_000);
      nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    }
  }

  await supabase
    .from("runs")
    .update({
      status: finalStatus,
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
      cost_cents: cost,
      output: { text: output },
      error_text: errorText,
      next_retry_at: nextRetryAt,
    })
    .eq("id", runId);

  // Chain dispatch: queue the next agent with this run's output as
  // the input prompt. We pull the next_agent_id from the agent row
  // (which we already have in scope) and only queue when the run
  // ended in the matching status (done/failed).
  await maybeQueueChain(supabase, agent, business, finalStatus, output, errorText);

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
      // Pre-flight failures (paused business, missing agent, spend
      // limit hit) are NOT transient — never retry.
      next_retry_at: null,
    })
    .eq("id", runId);
  return { ok: false, status: "failed", error: reason };
}

// Queues the next agent in a chain. The previous run's output (or
// error_text on failure) becomes the new run's input prompt — so an
// "extract → translate → publish" pipeline just connects the dots
// via next_agent_on_done.
async function maybeQueueChain(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  agent: {
    id: string;
    next_agent_on_done: string | null;
    next_agent_on_fail: string | null;
  },
  business: { id: string } | null,
  finalStatus: "done" | "failed",
  output: string,
  errorText: string | null,
): Promise<void> {
  const nextId =
    finalStatus === "done"
      ? agent.next_agent_on_done
      : agent.next_agent_on_fail;
  if (!nextId) return;

  // Verify the next agent still exists and isn't archived.
  const { data: nextAgent } = await supabase
    .from("agents")
    .select("id, workspace_id, business_id, archived_at")
    .eq("id", nextId)
    .maybeSingle();
  if (!nextAgent || nextAgent.archived_at) return;

  const promptText =
    finalStatus === "done" ? output : (errorText ?? "(no error text)");

  const { data: newRun } = await supabase
    .from("runs")
    .insert({
      workspace_id: nextAgent.workspace_id,
      agent_id: nextAgent.id,
      business_id: nextAgent.business_id ?? business?.id ?? null,
      triggered_by: "chain",
      status: "queued",
      input: { prompt: promptText, source: "chain", from_agent: agent.id },
    })
    .select("id")
    .single();

  if (newRun) {
    void dispatchRun(newRun.id as string).catch((err) =>
      console.error("chain dispatchRun failed", err),
    );
  }
}

// Heuristic: error messages that suggest a transient failure (worth
// retrying) versus a permanent config issue (no retry).
function isTransientError(msg: string): boolean {
  const lc = msg.toLowerCase();
  // Don't retry hard-config issues.
  if (
    lc.includes("missing key") ||
    lc.includes("api key") ||
    lc.includes("missing_key") ||
    lc.includes("permission denied") ||
    lc.includes("invalid model") ||
    lc.includes("unauthorized") ||
    lc.includes("not configured") ||
    lc.includes("unsupported")
  ) {
    return false;
  }
  // Common transient signals.
  return (
    lc.includes("rate limit") ||
    lc.includes("rate_limit") ||
    lc.includes("timeout") ||
    lc.includes("timed out") ||
    lc.includes("network") ||
    lc.includes("503") ||
    lc.includes("502") ||
    lc.includes("504") ||
    lc.includes("econnreset") ||
    lc.includes("etimedout") ||
    // Default: retry unknown errors once or twice rather than give up.
    true
  );
}
