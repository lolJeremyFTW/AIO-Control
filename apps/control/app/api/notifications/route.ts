// Returns the active "needs attention" list for the current workspace —
// open queue items in review/fail state + the most recent failed runs.
// RLS scopes everything to workspaces the user is a member of.

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type Notif = {
  kind: "queue" | "run";
  id: string;
  title: string;
  sub: string;
  state: string;
  business_id: string | null;
  created_at: string;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [queue, runs, dismissals] = await Promise.all([
    supabase
      .from("queue_items")
      .select("id, title, business_id, state, created_at")
      .in("state", ["review", "fail"])
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r) => (r.data ?? []) as { id: string; title: string; business_id: string | null; state: string; created_at: string }[]),
    supabase
      .from("runs")
      .select("id, business_id, status, error_text, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10)
      .then((r) => (r.data ?? []) as { id: string; business_id: string | null; status: string; error_text: string | null; created_at: string }[]),
    supabase
      .from("notification_dismissals")
      .select("source_kind, source_id")
      .eq("user_id", user.id)
      .then((r) => (r.data ?? []) as { source_kind: "queue" | "run"; source_id: string }[]),
  ]);

  // Build a quick lookup so the filter is O(n) regardless of dismissal
  // count — and let users still see plenty of bell content even when
  // they've cleared a lot in the past.
  const dismissedQueue = new Set(
    dismissals.filter((d) => d.source_kind === "queue").map((d) => d.source_id),
  );
  const dismissedRuns = new Set(
    dismissals.filter((d) => d.source_kind === "run").map((d) => d.source_id),
  );

  const items: Notif[] = [
    ...queue
      .filter((q) => !dismissedQueue.has(q.id))
      .map((q) => ({
        kind: "queue" as const,
        id: q.id,
        title: q.title,
        sub: q.state,
        state: q.state,
        business_id: q.business_id,
        created_at: q.created_at,
      })),
    ...runs
      .filter((r) => !dismissedRuns.has(r.id))
      .map((r) => ({
        kind: "run" as const,
        id: r.id,
        title: r.error_text ?? "Run failed",
        sub: r.status,
        state: r.status,
        business_id: r.business_id,
        created_at: r.created_at,
      })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return NextResponse.json({ items });
}
