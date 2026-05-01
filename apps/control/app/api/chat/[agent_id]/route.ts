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

import { getAgentById } from "../../../../lib/queries/agents";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

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
      input: { messages: body.messages, thread_id: body.thread_id ?? null },
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

        if (body.thread_id) {
          await supabase
            .from("chat_messages")
            .insert([
              ...body.messages
                .filter((m) => m.role === "user")
                .slice(-1)
                .map((m) => ({
                  thread_id: body.thread_id!,
                  role: m.role,
                  content: { text: m.content },
                })),
              {
                thread_id: body.thread_id,
                role: "assistant",
                content: { text: assistantText },
                run_id: run.id,
              },
            ]);
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
    },
  });
}
