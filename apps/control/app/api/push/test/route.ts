// Sends a test push to all subscriptions of the current user. Mainly so
// the user can verify "yes notifications work on my phone" right after
// subscribing — and so the operator can fire one off to debug delivery.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { sendPush } from "../../../../lib/push/webpush";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_secret")
    .eq("user_id", user.id);

  type SubRow = { endpoint: string; p256dh: string; auth_secret: string };
  const rows = (subs ?? []) as SubRow[];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No subscriptions yet for this user" },
      { status: 404 },
    );
  }

  const results = await Promise.all(
    rows.map((s) =>
      sendPush(s, {
        title: "AIO Control",
        body: "Test notificatie — als je dit ziet, werkt het.",
        url: "/aio/admin/dashboard",
        tag: "aio-test",
      }),
    ),
  );

  // Drop dead subscriptions (410 Gone / 404) so we stop pushing to them.
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
    results,
  });
}
