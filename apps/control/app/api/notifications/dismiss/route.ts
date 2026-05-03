// Mark a single notification as dismissed for the current user. Notifications
// are synthesized from queue_items + failed runs — dismissal is per-user,
// stored in notification_dismissals so other workspace members keep seeing
// the underlying review/fail items until they decide to dismiss themselves.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    kind?: "queue" | "run";
    id?: string;
  } | null;
  if (!body || (body.kind !== "queue" && body.kind !== "run") || !body.id) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notification_dismissals")
    .upsert(
      {
        user_id: user.id,
        source_kind: body.kind,
        source_id: body.id,
      },
      { onConflict: "user_id,source_kind,source_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
