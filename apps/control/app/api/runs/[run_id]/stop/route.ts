// Mark a queued/running run as cancelled. Doesn't physically interrupt
// the in-process dispatcher (that needs an AbortController plumbed
// through streamChat which is a bigger refactor) — but it flips the
// run row's status to "failed" with a clear error_text so the drawer
// stops showing the spinner and the user knows the agent was told to
// stop. The dispatcher's eventual final UPDATE is a no-op for the
// status field (it'll still write end timing + cost), keeping the
// "cancelled" terminal state.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
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

  const { data: run, error: readErr } = await supabase
    .from("runs")
    .select("id, status")
    .eq("id", run_id)
    .maybeSingle();
  if (readErr || !run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (run.status === "done" || run.status === "failed") {
    return NextResponse.json({ ok: true, already: true });
  }

  const { error } = await supabase
    .from("runs")
    .update({
      status: "failed",
      ended_at: new Date().toISOString(),
      error_text: "Gestopt door gebruiker",
      // Disable retry — manual stop is intentional.
      next_retry_at: null,
    })
    .eq("id", run_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
