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

import { AIO_TOOLS, defaultToolsForKind } from "@aio/ai/aio-tools";

import { resolveApiKey } from "../../../../lib/api-keys/resolve";
import { resolveOllamaEndpoint } from "../../../../lib/ollama/endpoint";
import {
  buildAgentSystemPrompt,
  prependPreamble,
} from "../../../../lib/agents/business-context";
import {
  putPendingApproval,
  takePendingApproval,
} from "../../../../lib/agents/pending-approvals";
import {
  executeAioTool,
  executeAioWriteTool,
} from "../../../../lib/agents/tool-execution";
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
  /** Sent by the panel when the user clicks Approve / Cancel on a
   *  confirm_required card. The server looks up the pending state
   *  by tool_call_id (in lib/agents/pending-approvals), executes the
   *  underlying write-tool (or a "user cancelled" tool_result), and
   *  continues the multi-turn loop with the model. */
  approve_tool?: {
    tool_call_id: string;
    decision: "approve" | "cancel";
  };
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

  // Build the FULL system-prompt preamble (platform / identity /
  // tools / siblings / budget / business / workspace-rules) and
  // prepend it to whatever system prompt the user wrote. One source
  // of truth across chat + cron + webhook + manual triggers.
  const preamble = await buildAgentSystemPrompt({
    id: agent.id,
    workspace_id: agent.workspace_id,
    business_id: agent.business_id,
    name: agent.name,
    kind: agent.kind,
    provider: agent.provider,
    model: agent.model,
  });
  config.systemPrompt = prependPreamble(preamble, config.systemPrompt);

  // Resolve the per-tenant API key for this agent's provider. Order
  // is navnode → business → workspace → env-var fallback. Set up once
  // per request — providers reuse it.
  const apiKey = await resolveApiKey(agent.provider, {
    workspaceId: agent.workspace_id,
    businessId: agent.business_id,
  });

  // Resolve the workspace's local Ollama endpoint once so any Ollama-
  // backed turn (the agent's base provider OR a routing rule promoting
  // to Ollama mid-stream) hits the same box. Empty/null = providers
  // fall back to OLLAMA_BASE_URL → localhost.
  const ollamaEndpoint = await resolveOllamaEndpoint(agent.workspace_id);

  const encoder = new TextEncoder();
  const finishedAt = { ts: 0 };
  let assistantText = "";
  let usage: { input: number; output: number; cost: number } | null = null;

  // Resolve which AIO Control tools this agent is allowed to use.
  // null in the DB = use the kind defaults; explicit array = allow-list.
  // We translate names → spec objects → only the specs the registry
  // knows about (filters out stale names from older config).
  const allowedToolNames =
    (agent as { allowed_tools?: string[] | null }).allowed_tools ??
    defaultToolsForKind(agent.kind);
  const tools = allowedToolNames
    .map((n) => AIO_TOOLS[n])
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AGUIEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      // Multi-turn dispatch loop. We accumulate tool_use blocks the
      // model emits during the stream, execute READ + META tools
      // server-side, append tool_result messages, and re-invoke
      // streamChat. Capped at 5 hops so a stuck loop can't burn
      // tokens forever. WRITE tools and ask_followup defer to the
      // panel and break the loop (the user's next request resumes).
      const HOPS_MAX = 5;
      const messages: ChatMessage[] = [...body.messages];
      let deferred = false;

      // ── approve_tool short-circuit ─────────────────────────────────
      // When the panel sends approve_tool, we don't go to Claude
      // first — we look up the stashed pending state, execute the
      // write-tool (or skip it on cancel), inject the
      // assistant→tool_use + user→tool_result turns into messages,
      // and let the normal loop continue Claude from there.
      if (body.approve_tool) {
        const pending = takePendingApproval(body.approve_tool.tool_call_id);
        if (!pending) {
          send({
            type: "error",
            code: "approval_expired",
            message:
              "Deze bevestiging is verlopen of al verwerkt. Vraag het opnieuw aan de agent.",
          });
        } else {
          // Replay the conversation up to where confirm_required was
          // emitted. The stashed messages already include the user
          // turn that triggered the tool call.
          messages.length = 0;
          messages.push(...(pending.messages as ChatMessage[]));

          let toolResultJson: string;
          if (body.approve_tool.decision === "approve") {
            const res = await executeAioWriteTool(
              pending.name,
              pending.args,
              {
                workspaceId: pending.workspace_id,
                defaultBusinessId: pending.business_id,
              },
            );
            if (res.kind === "ok") {
              toolResultJson = JSON.stringify(res.data);
            } else if (res.kind === "error") {
              toolResultJson = JSON.stringify({ error: res.error });
            } else {
              // executeAioWriteTool shouldn't normally defer (the
              // confirm gate already happened); fall back so the
              // model sees a clear error rather than nothing.
              toolResultJson = JSON.stringify({
                error: "Unexpected defer from write-tool execution.",
              });
            }
          } else {
            toolResultJson = JSON.stringify({
              cancelled_by_user: true,
              reason: "User declined the proposed action.",
            });
          }

          // Replay assistant turn (text + tool_use) and user turn
          // (tool_result) so Claude can continue.
          const assistantBlocks: unknown[] = [];
          if (pending.assistant_text) {
            assistantBlocks.push({
              type: "text",
              text: pending.assistant_text,
            });
          }
          assistantBlocks.push({
            type: "tool_use",
            id: pending.tool_call_id,
            name: pending.name,
            input: pending.args,
          });
          messages.push({
            role: "assistant",
            content: JSON.stringify(assistantBlocks),
          });
          messages.push({
            role: "user",
            content: JSON.stringify([
              {
                type: "tool_result",
                tool_use_id: pending.tool_call_id,
                content: toolResultJson,
              },
            ]),
          });
          // assistantText accumulates again from the next streamChat
          // call, so reset it here.
          assistantText = "";
        }
      }

      try {
        for (let hop = 0; hop < HOPS_MAX && !deferred; hop++) {
          const toolUses: Array<{
            id: string;
            name: string;
            args: unknown;
          }> = [];

          for await (const event of streamChat({
            provider: agent.provider as ProviderId,
            config,
            messages,
            runId: run.id,
            apiKey,
            tenant: {
              workspaceId: agent.workspace_id,
              businessId: agent.business_id,
              ollamaEndpoint,
            },
            sessionId: threadId ?? undefined,
            tools,
          })) {
            if (event.type === "token") assistantText += event.delta;
            if (event.type === "message_end") {
              usage = {
                input: event.usage.input_tokens,
                output: event.usage.output_tokens,
                cost: event.usage.cost_cents,
              };
            }
            if (event.type === "tool_call_start") {
              toolUses.push({
                id: event.tool_call_id,
                name: event.name,
                args: event.args,
              });
            }
            send(event);
          }

          // No tool_use in this turn → conversation is complete.
          if (toolUses.length === 0) break;

          // Execute each tool. READ tools return data; META tools
          // (ask_followup, …) and WRITE tools return defer events
          // we forward to the panel and stop the loop.
          const toolResults: Array<{ id: string; content: string }> = [];
          for (const tu of toolUses) {
            const res = await executeAioTool(tu.name, tu.args, {
              workspaceId: agent.workspace_id,
              defaultBusinessId: agent.business_id,
            });
            if (res.kind === "defer") {
              const ev = res.event;
              if (ev.type === "ask_followup") {
                send({
                  type: "ask_followup",
                  tool_call_id: tu.id,
                  question: ev.question,
                  options: ev.options,
                });
              } else if (ev.type === "confirm_required") {
                // Stash the pending state server-side so the panel's
                // approve_tool round-trip can look it up without
                // having to carry args / messages back over the wire.
                putPendingApproval({
                  tool_call_id: tu.id,
                  name: ev.pending.name,
                  args: ev.pending.args,
                  assistant_text: assistantText,
                  messages: [...messages],
                  workspace_id: agent.workspace_id,
                  business_id: agent.business_id,
                  agent_id: agent.id,
                });
                send({
                  type: "confirm_required",
                  tool_call_id: tu.id,
                  summary: ev.summary,
                  kind: ev.kind,
                  pending: ev.pending,
                  assistant_text: assistantText,
                });
              } else if (ev.type === "open_ui_at") {
                send({
                  type: "open_ui_at",
                  path: ev.path,
                  label: ev.label,
                });
                // open_ui_at is non-blocking — synthesize an "ack"
                // result so the model can keep going.
                toolResults.push({
                  id: tu.id,
                  content: JSON.stringify({ navigated: true }),
                });
                continue;
              } else if (ev.type === "todo_set") {
                send({ type: "todo_set", items: ev.items });
                toolResults.push({
                  id: tu.id,
                  content: JSON.stringify({ ok: true }),
                });
                continue;
              }
              deferred = true;
              break;
            }
            // ok / error — JSON-encode for the model.
            toolResults.push({
              id: tu.id,
              content:
                res.kind === "ok"
                  ? JSON.stringify(res.data)
                  : JSON.stringify({ error: res.error }),
            });
          }

          if (deferred) break;
          if (toolResults.length === 0) break;

          // Append the assistant turn's tool_use blocks + a user turn
          // with the tool_results, then continue the loop. The Claude
          // provider's decodeBlocks() turns the JSON-encoded array
          // back into structured content blocks before calling the
          // SDK.
          messages.push({
            role: "assistant",
            content: JSON.stringify(
              toolUses.map((t) => ({
                type: "tool_use",
                id: t.id,
                name: t.name,
                input: t.args,
              })),
            ),
          });
          messages.push({
            role: "user",
            content: JSON.stringify(
              toolResults.map((r) => ({
                type: "tool_result",
                tool_use_id: r.id,
                content: r.content,
              })),
            ),
          });
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
