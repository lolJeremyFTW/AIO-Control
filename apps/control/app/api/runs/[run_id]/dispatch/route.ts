// Manual dispatch trigger — useful for re-running a failed run from the
// Schedules / RunsTimeline UI without creating a new schedule. Auth comes
// from the user's session; RLS enforces workspace membership when the
// dispatcher reads the run.

import { NextResponse } from "next/server";

import { dispatchRun } from "../../../../../lib/dispatch/runs";
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Confirm the user can see this run via RLS before kicking the worker.
  const { data: run } = await supabase
    .from("runs")
    .select("id, status")
    .eq("id", run_id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reset to queued so the dispatcher's idempotency check (skip if done|
  // failed) doesn't bail.
  await supabase
    .from("runs")
    .update({ status: "queued", error_text: null, output: null })
    .eq("id", run_id);

  const result = await dispatchRun(run_id);
  return NextResponse.json(result);
}
