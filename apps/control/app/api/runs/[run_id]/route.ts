// Single-run detail endpoint — returns the full run row including
// message_history (the structured replay captured during dispatch),
// input, output and timing. Used by RunDetailDrawer to render a past
// run chat-style. RLS gates access to workspace members.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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

  const { data, error } = await supabase
    .from("runs")
    .select(
      `id, workspace_id, agent_id, business_id, schedule_id,
       triggered_by, status, started_at, ended_at, duration_ms,
       cost_cents, input_tokens, output_tokens, output,
       error_text, message_history,
       created_at, attempt, max_attempts, next_retry_at,
       agents:agent_id ( id, name, provider, model )`,
    )
    .eq("id", run_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let input: unknown = null;
  const hasReplay =
    Array.isArray(data.message_history) && data.message_history.length > 0;
  if (!hasReplay) {
    const { data: inputRow, error: inputError } = await supabase
      .from("runs")
      .select("input")
      .eq("id", run_id)
      .maybeSingle();
    if (inputError) {
      return NextResponse.json({ error: inputError.message }, { status: 500 });
    }
    input = inputRow?.input ?? null;
  }

  return NextResponse.json({ run: { ...data, input } });
}
