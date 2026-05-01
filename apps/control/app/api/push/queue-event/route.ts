// Inbound webhook from the Postgres trigger trg_queue_push (migration
// 009_queue_push_trigger.sql). Fans out a Web Push to every subscription
// owned by a member of the workspace where the queue item lives.
//
// Auth: a shared secret in the X-Aio-Callback-Secret header. The trigger
// reads `app.callback_secret` (set per-session via SET LOCAL or via
// ALTER DATABASE postgres SET app.callback_secret = '…'); this route
// compares it constant-time against ROUTINE_CALLBACK_SECRET (the same
// secret we use for Anthropic Routine callbacks).

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { sendPush } from "../../../../lib/push/webpush";
import { getServiceRoleSupabase } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

type Body = {
  workspace_id?: string;
  business_id?: string | null;
  queue_item_id?: string;
  state?: "review" | "fail" | "auto";
  title?: string;
};

function safeEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-aio-callback-secret") ?? "";
  const expected = process.env.ROUTINE_CALLBACK_SECRET ?? "";
  if (!expected || !safeEquals(secret, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.workspace_id || !body.queue_item_id) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const supabase = getServiceRoleSupabase();

  // Find every push subscription belonging to a workspace member.
  type Member = { user_id: string };
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", body.workspace_id);
  const userIds = (members as Member[] | null)?.map((m) => m.user_id) ?? [];
  if (userIds.length === 0) return NextResponse.json({ sent: 0 });

  type Sub = { endpoint: string; p256dh: string; auth_secret: string };
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_secret")
    .in("user_id", userIds);
  const rows = (subs as Sub[] | null) ?? [];
  if (rows.length === 0) return NextResponse.json({ sent: 0 });

  const tone = body.state === "fail" ? "Handmatige check" : "Review";
  const url = body.business_id
    ? `/aio/business/${body.business_id}`
    : "/aio";
  const results = await Promise.all(
    rows.map((s) =>
      sendPush(s, {
        title: `${tone}: ${body.title ?? "Queue item"}`,
        body:
          body.state === "fail"
            ? "Een agent run is gefaald — check de queue."
            : "Wachtrij vraagt review.",
        url,
        tag: `queue-${body.queue_item_id}`,
      }),
    ),
  );

  // Prune dead endpoints (404 / 410).
  const dead = rows.filter(
    (_, i) => results[i]?.statusCode === 404 || results[i]?.statusCode === 410,
  );
  if (dead.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in(
        "endpoint",
        dead.map((s) => s.endpoint),
      );
  }

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    total: rows.length,
    pruned: dead.length,
  });
}
