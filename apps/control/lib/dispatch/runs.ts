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
import { resolveApiKey } from "../api-keys/resolve";
import type { RunStep } from "../runs/message-history";

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
       agents:agent_id ( id, name, provider, model, config, key_source, archived_at, next_agent_on_done, next_agent_on_fail ),
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
    key_source: string | null;
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
  // Subscription-Claude (Pro/Max plans) is only allowed via interactive
  // chat or Anthropic Routines (cron schedules route there directly,
  // bypassing this dispatcher). Server-spawned CLI runs from webhooks /
  // manual / chain triggers count as automation against the subscription
  // — Anthropic bans accounts that hammer the CLI on a server. Force
  // those runs to fail loudly so the user picks an API key or a
  // Routines-cron schedule instead.
  if (agent.key_source === "subscription") {
    return await markFailed(
      runId,
      "Subscription-Claude agents kunnen niet via webhook / Run now / chain draaien — gebruik chat of een cron-schedule (Anthropic Routines) zodat je Claude-account niet wordt gebanned.",
    );
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
  let inputTokens = 0;
  let outputTokens = 0;
  let errorText: string | null = null;

  // Build a structured replay of the run as it streams. The drawer
  // renders this chat-style (user → assistant → tool_call → result →
  // error). Seed it with the user-side input we built above so old
  // viewers still see what was sent in even if the model produced
  // nothing.
  const history: RunStep[] = messages.map((m) => ({
    kind: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    text: m.content,
    at: startedAt,
  }));
  // Track the assistant turn we're currently appending tokens to so
  // multiple message_start blocks (rare; provider re-emits) split into
  // separate bubbles instead of fusing.
  let activeAssistant: RunStep & { kind: "assistant" } = {
    kind: "assistant",
    text: "",
    at: startedAt,
  };
  history.push(activeAssistant);
  const toolCalls = new Map<string, RunStep & { kind: "tool_call" }>();

  // Resolve workspace-level Ollama endpoint so a scheduled / webhook
  // / manual run hits the same box as the chat panel does. Cheap;
  // single row read, no-op when the workspace hasn't configured one.
  const ollamaEndpoint = await resolveOllamaEndpoint(run.workspace_id);

  // Persistent runtime-agent names — Hermes/OpenClaw providers spawn
  // the named profile/agent when set. Same row-read pattern as the
  // chat route; runs through the service-role client because the
  // worker isn't authed as a user.
  const { data: runtimeRow } = await supabase
    .from("workspaces")
    .select("hermes_agent_name, openclaw_agent_name")
    .eq("id", run.workspace_id)
    .maybeSingle();
  const hermesAgentName =
    (runtimeRow?.hermes_agent_name as string | null) ?? null;
  const openclawAgentName =
    (runtimeRow?.openclaw_agent_name as string | null) ?? null;

  // Resolve the provider API key the same way the chat route does —
  // walk navnode → business → workspace → env fallback. Without this,
  // keys stored in Settings → API Keys are ignored for cron/webhook runs.
  const apiKey = await resolveApiKey(agent.provider, {
    workspaceId: run.workspace_id,
    businessId: run.business_id,
  });

  // Periodic mid-run flush of message_history so the run drawer streams
  // partial assistant text in real time via the realtime subscription
  // (UPDATE on runs). Without this the drawer stays on "Agent is bezig…"
  // for the full duration. Throttled to once per 1.2 s so we don't
  // hammer Postgres on token-heavy runs.
  let lastFlushAt = 0;
  // Tighter than the original 1.2s — the run drawer subscribes to
  // realtime UPDATEs on this row so a faster cadence makes the
  // streaming feel actually live without a manual refresh.
  const FLUSH_INTERVAL_MS = 500;
  const flushHistory = async () => {
    lastFlushAt = Date.now();
    try {
      await supabase
        .from("runs")
        .update({ message_history: history })
        .eq("id", runId);
    } catch (err) {
      // Non-fatal; the final write at the end will catch up.
      console.warn("mid-run history flush failed", err);
    }
  };

  try {
    for await (const event of streamChat({
      provider: agent.provider as ProviderId,
      config,
      messages,
      runId,
      apiKey,
      tenant: {
        workspaceId: run.workspace_id,
        businessId: run.business_id,
        ollamaEndpoint,
        hermesAgentName,
        openclawAgentName,
      },
    })) {
      if (event.type === "token") {
        output += event.delta;
        activeAssistant.text += event.delta;
        if (Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) {
          void flushHistory();
        }
      } else if (event.type === "message_start") {
        // A new assistant turn begins (provider is restarting after a
        // tool call, or it's the very first start). If the previous
        // assistant slot has content, leave it and open a fresh one.
        if (activeAssistant.text.length > 0) {
          activeAssistant = {
            kind: "assistant",
            text: "",
            at: new Date().toISOString(),
          };
          history.push(activeAssistant);
        }
      } else if (event.type === "message_end") {
        cost = event.usage.cost_cents;
        inputTokens = event.usage.input_tokens;
        outputTokens = event.usage.output_tokens;
      } else if (event.type === "tool_call_start") {
        const step: RunStep & { kind: "tool_call" } = {
          kind: "tool_call",
          name: event.name,
          args: event.args,
          at: new Date().toISOString(),
        };
        toolCalls.set(event.tool_call_id, step);
        history.push(step);
        // Tool calls are visually significant — flush immediately so
        // the user sees "agent is calling X" instead of waiting for
        // the next token-driven flush window.
        void flushHistory();
      } else if (event.type === "tool_call_result") {
        const step = toolCalls.get(event.tool_call_id);
        if (step) step.result = event.output;
        void flushHistory();
      } else if (event.type === "error") {
        errorText = event.message;
        history.push({
          kind: "error",
          message: event.message,
          at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : "dispatch error";
    history.push({
      kind: "error",
      message: errorText,
      at: new Date().toISOString(),
    });
  }

  // Drop the trailing empty assistant placeholder if the run produced
  // no tokens — it would just render as an empty bubble in the drawer.
  // Local var so noUncheckedIndexedAccess (strict TS) sees a single
  // defined narrowing rather than two separate index reads.
  const tail = history[history.length - 1];
  if (tail && tail.kind === "assistant" && tail.text === "") {
    history.pop();
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
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      output: { text: output },
      error_text: errorText,
      next_retry_at: nextRetryAt,
      message_history: history,
    })
    .eq("id", runId);

  // Chain dispatch: queue the next agent with this run's output as
  // the input prompt. We pull the next_agent_id from the agent row
  // (which we already have in scope) and only queue when the run
  // ended in the matching status (done/failed).
  await maybeQueueChain(supabase, agent, business, finalStatus, output, errorText);

  // Team dispatch: execute any dispatch_agent tool calls the router
  // agent emitted during this run. Tool calls in background runs don't
  // get executed inline (no tool-result feedback loop), so we fire them
  // here after the run completes. Each dispatch_agent call in the
  // history becomes a new sub-run queued immediately.
  await maybeFireDispatchAgentCalls(supabase, history, run);

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
    .select("id, workspace_id, business_id, archived_at, nav_node_id")
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
      nav_node_id: nextAgent.nav_node_id ?? null,
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

// Execute dispatch_agent tool calls emitted by a router agent during
// a background run. Since background runs don't have a tool-result
// feedback loop, these calls are gathered from the history and fired
// asynchronously after the parent run finishes.
async function maybeFireDispatchAgentCalls(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  history: RunStep[],
  run: { workspace_id: string; business_id: string | null },
): Promise<void> {
  const dispatchCalls = history.filter(
    (s): s is RunStep & { kind: "tool_call" } =>
      s.kind === "tool_call" && s.name === "dispatch_agent",
  );
  if (dispatchCalls.length === 0) return;

  for (const call of dispatchCalls) {
    const args = (call.args ?? {}) as Record<string, unknown>;
    const agentId = String(args.agent_id ?? "").trim();
    const input = String(args.input ?? "").trim();
    if (!agentId || !input) continue;

    // Validate the target agent belongs to the same workspace.
    const { data: targetAgent } = await supabase
      .from("agents")
      .select("id, workspace_id, business_id, nav_node_id, archived_at, key_source")
      .eq("id", agentId)
      .eq("workspace_id", run.workspace_id)
      .is("archived_at", null)
      .maybeSingle();
    if (!targetAgent || targetAgent.key_source === "subscription") continue;

    const { data: newRun } = await supabase
      .from("runs")
      .insert({
        workspace_id: run.workspace_id,
        agent_id: agentId,
        business_id: targetAgent.business_id ?? run.business_id ?? null,
        nav_node_id: (targetAgent.nav_node_id as string | null) ?? null,
        triggered_by: "dispatch_agent",
        status: "queued",
        input: {
          prompt: input,
          source: "dispatch_agent",
          label: typeof args.label === "string" ? args.label : undefined,
        },
      })
      .select("id")
      .single();

    if (newRun) {
      void dispatchRun(newRun.id as string).catch((err) =>
        console.error("dispatch_agent sub-run failed", err),
      );
    }
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
