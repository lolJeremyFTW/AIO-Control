// Continue a finished run as a chat thread. Takes a follow-up prompt,
// builds a new messages array from the source run's message_history
// (filtered to user/assistant turns), appends the new user message,
// and dispatches a fresh run so the agent can respond with full prior
// context. The drawer pivots to the new run id and the realtime
// subscription streams the response in.
//
// Why a new run instead of mutating the original? message_history is
// the per-run source of truth for the drawer; appending in-place would
// race with the realtime UPDATE stream and complicate retry semantics.
// Each follow-up gets its own row, naturally chaining via input.messages.

import { NextResponse } from "next/server";

import { dispatchRun } from "../../../../../lib/dispatch/runs";
import type { RunStep } from "../../../../../lib/runs/message-history";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ run_id: string }> },
) {
  const { run_id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
  } | null;
  const prompt = body?.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  // RLS gates the read — user must be a workspace member.
  const { data: src } = await supabase
    .from("runs")
    .select(
      "id, workspace_id, agent_id, business_id, message_history, input, output",
    )
    .eq("id", run_id)
    .maybeSingle();
  if (!src) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Build the messages array. Prefer the structured history; fall back
  // to input.prompt + output.text for legacy runs that pre-date
  // message_history capture.
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  const history = src.message_history as RunStep[] | null;
  if (history && history.length > 0) {
    for (const step of history) {
      if (step.kind === "user" && step.text) {
        messages.push({ role: "user", content: step.text });
      } else if (step.kind === "assistant" && step.text) {
        messages.push({ role: "assistant", content: step.text });
      }
    }
  } else {
    const input = src.input as { prompt?: string } | null;
    const output = src.output as { text?: string } | null;
    if (input?.prompt) messages.push({ role: "user", content: input.prompt });
    if (output?.text) messages.push({ role: "assistant", content: output.text });
  }
  // Append the new user turn.
  messages.push({ role: "user", content: prompt });

  const { data: newRun, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: src.workspace_id,
      agent_id: src.agent_id,
      business_id: src.business_id,
      triggered_by: "chat",
      status: "queued",
      input: { messages, source: "followup", parent_run_id: src.id },
    })
    .select("id")
    .single();
  if (error || !newRun) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  void dispatchRun(newRun.id as string).catch((err: unknown) => {
    console.error("followup dispatchRun failed", err);
  });

  return NextResponse.json({ run_id: newRun.id });
}
