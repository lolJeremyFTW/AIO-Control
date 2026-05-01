// Callback receiver for Claude Routines. Authenticate using a shared secret
// the routine echoes back in the payload — only routines we created (and
// whose secret we baked into the prompt) know the value.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

type CallbackBody = {
  shared_secret?: string;
  output?: unknown;
  status?: "done" | "failed" | "review";
  cost_cents?: number;
  duration_ms?: number;
  error_text?: string;
};

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ run_id: string }> },
) {
  const { run_id } = await ctx.params;
  const expected = process.env.ROUTINE_CALLBACK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "ROUTINE_CALLBACK_SECRET is not configured." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as CallbackBody | null;
  if (!body || !body.shared_secret) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!safeEquals(body.shared_secret, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleSupabase();
  const { error } = await supabase
    .from("runs")
    .update({
      status: body.status ?? "done",
      ended_at: new Date().toISOString(),
      duration_ms: body.duration_ms,
      cost_cents: body.cost_cents ?? 0,
      output: body.output ?? null,
      error_text: body.error_text ?? null,
    })
    .eq("id", run_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
