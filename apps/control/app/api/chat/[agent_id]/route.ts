// SSE chat endpoint. Auth comes from the Supabase session cookie via the
// proxy; RLS gives us the agent only if the user is a member of the
// agent's workspace. The provider router does the heavy lifting; we just
// wire up streaming in/out, run-row creation, and durable message storage.

import { NextResponse } from "next/server";

import {
  streamChat,
  type AgentConfig,
  type ProviderId,
} from "@aio/ai/router";
import type { AGUIEvent, ChatMessage } from "@aio/ai/ag-ui";

import { resolveApiKey } from "../../../../lib/api-keys/resolve";
import { buildBusinessContextPrefix } from "../../../../lib/agents/business-context";
import { checkSpendLimit } from "../../../../lib/dispatch/spend-limit";
import { dispatchRunEvent } from "../../../../lib/notify/dispatch";
import { getAgentById } from "../../../../lib/queries/agents";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  ensureThreadForChat,
  persistChatTurn,
} from "../../../actions/chat";

export const dynamic = "force-dynamic";

type Body = {
  messages: ChatMessage[];
  thread_id?: string;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ agent_id: string }> },
) {
  const { agent_id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await getAgentById(agent_id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Spend-limit pre-flight. If the user has set a daily/monthly cap
  // and we're over it, refuse before even creating a run row.
  if (agent.business_id) {
    const limit = await checkSpendLimit(agent.business_id);
    if (!limit.ok) {
      const reason =
        limit.reason === "daily_exceeded"
          ? `Daily spend limit reached (€${(limit.limit_cents / 100).toFixed(2)}, gebruikt €${(limit.current_cents / 100).toFixed(2)}).`
          : `Monthly spend limit reached (€${(limit.limit_cents / 100).toFixed(2)}, gebruikt €${(limit.current_cents / 100).toFixed(2)}).`;
      return NextResponse.json(
        { error: reason },
        { status: 402 }, // Payment Required (semantic fit)
      );
    }
  }

  // Find the most recent user message — used to seed the thread title
  // when we have to mint one and as the persisted user-turn payload.
  const lastUserMsg = [...body.messages]
    .reverse()
    .find((m) => m.role === "user");
  const lastUserText =
    typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";

  // Ensure a chat_threads row exists. We mint one on the first message
  // when the client didn't pass thread_id; subsequent calls reuse it.
  const thread = await ensureThreadForChat({
    workspace_id: agent.workspace_id,
    agent_id: agent.id,
    thread_id: body.thread_id ?? null,
    first_user_message: lastUserText,
  });
  const threadId = thread?.id ?? null;

  // Insert the run row up front so the chat panel can correlate stream
  // events with a persisted record. RLS policies enforce workspace
  // membership + editor-or-higher role.
  const { data: run, error: runErr } = await supabase
    .from("runs")
    .insert({
      workspace_id: agent.workspace_id,
      agent_id: agent.id,
      business_id: agent.business_id,
      triggered_by: "chat",
      status: "running",
      started_at: new Date().toISOString(),
      input: { messages: body.messages, thread_id: threadId },
    })
    .select("id")
    .single();
  if (runErr || !run) {
    return NextResponse.json(
      { error: runErr?.message ?? "Failed to create run" },
      { status: 500 },
    );
  }

  const config = (agent.config ?? {}) as AgentConfig;
  if (agent.model && !config.model) config.model = agent.model;

  // Prepend the business context (description, mission, active
  // targets, workspace-wide rules) so the agent always knows what
  // it's working toward.
  const bizCtx = await buildBusinessContextPrefix(agent.business_id);
  if (bizCtx) {
    config.systemPrompt = config.systemPrompt
      ? `${bizCtx}\n\n---\n\n${config.systemPrompt}`
      : bizCtx;
  }

  // Resolve the per-tenant API key for this agent's provider. Order
  // is navnode → business → workspace → env-var fallback. Set up once
  // per request — providers reuse it.
  const apiKey = await resolveApiKey(agent.provider, {
    workspaceId: agent.workspace_id,
    businessId: agent.business_id,
  });

  const encoder = new TextEncoder();
  const finishedAt = { ts: 0 };
  let assistantText = "";
  let usage: { input: number; output: number; cost: number } | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AGUIEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        for await (const event of streamChat({
          provider: agent.provider as ProviderId,
          config,
          messages: body.messages,
          runId: run.id,
          apiKey,
          tenant: {
            workspaceId: agent.workspace_id,
            businessId: agent.business_id,
          },
          // Stable session id per chat thread → subprocess providers
          // (openclaw, hermes) keep context across turns.
          sessionId: threadId ?? undefined,
        })) {
          if (event.type === "token") assistantText += event.delta;
          if (event.type === "message_end") {
            usage = {
              input: event.usage.input_tokens,
              output: event.usage.output_tokens,
              cost: event.usage.cost_cents,
            };
          }
          send(event);
        }
      } catch (err) {
        send({
          type: "error",
          code: "internal",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        finishedAt.ts = Date.now();
        controller.close();

        // Best-effort persistence after the stream closes. We use the
        // (RLS-aware) Supabase client the user owns, so writes still
        // respect the editor+ policy.
        await supabase
          .from("runs")
          .update({
            status: "done",
            ended_at: new Date().toISOString(),
            duration_ms:
              finishedAt.ts && (finishedAt.ts - new Date().getTime()),
            cost_cents: usage?.cost ?? 0,
            output: { text: assistantText },
          })
          .eq("id", run.id)
          .then(({ error }) => {
            if (error) console.error("update run failed", error);
          });

        // Fan out to Telegram + custom integrations on run completion.
        // Best-effort, no await for the user-facing response.
        void dispatchRunEvent(
          {
            id: run.id,
            workspace_id: agent.workspace_id,
            business_id: agent.business_id,
            agent_id: agent.id,
            schedule_id: null,
            status: "done",
            cost_cents: usage?.cost ?? 0,
            duration_ms: 0,
            output: { text: assistantText },
            error_text: null,
          },
          "done",
        );

        // Persist the just-completed turn so the chat sidebar can
        // load it back. Best-effort — we don't fail the response if
        // the insert hiccups.
        if (threadId && lastUserText) {
          await persistChatTurn({
            thread_id: threadId,
            user_message: lastUserText,
            assistant_message: assistantText,
            run_id: run.id,
          }).catch((err) => {
            console.error("persistChatTurn failed", err);
          });
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
      // Surface the thread + run id so the ChatPanel can keep the
      // sidebar in sync without parsing the stream body.
      "x-aio-thread-id": threadId ?? "",
      "x-aio-run-id": run.id,
    },
  });
}
