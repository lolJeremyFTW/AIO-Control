// Returns the active "needs attention" list for the current workspace —
// open queue items in review/fail state + the most recent failed runs.
// RLS scopes everything to workspaces the user is a member of.

import { NextResponse } from "next/server";

import { translateContentBatch } from "../../../lib/i18n/content-translations";
import { LOCALES, type Locale } from "../../../lib/i18n/dict";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";
const FAILED_RUN_LOOKBACK_HOURS = 24;

type Notif = {
  kind: "queue" | "run";
  id: string;
  workspace_id: string;
  title: string;
  sub: string;
  state: string;
  business_id: string | null;
  nav_node_id: string | null;
  created_at: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = normalizeLocale(url.searchParams.get("locale"));
  const workspaceFilter = url.searchParams.get("workspace");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const failedRunCutoff = new Date(
    Date.now() - FAILED_RUN_LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const queueQuery = supabase
    .from("queue_items")
    .select(
      "id, workspace_id, title, business_id, nav_node_id, state, created_at",
    )
    .in("state", ["review", "fail"])
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (workspaceFilter) queueQuery.eq("workspace_id", workspaceFilter);

  const runsQuery = supabase
    .from("runs")
    .select(
      "id, workspace_id, business_id, nav_node_id, status, error_text, created_at",
    )
    .eq("status", "failed")
    .gte("created_at", failedRunCutoff)
    .order("created_at", { ascending: false })
    .limit(10);
  if (workspaceFilter) runsQuery.eq("workspace_id", workspaceFilter);

  const [queue, runs, dismissals] = await Promise.all([
    queueQuery.then(
      (r) =>
        (r.data ?? []) as {
          id: string;
          workspace_id: string;
          title: string;
          business_id: string | null;
          nav_node_id: string | null;
          state: string;
          created_at: string;
        }[],
    ),
    runsQuery.then(
      (r) =>
        (r.data ?? []) as {
          id: string;
          workspace_id: string;
          business_id: string | null;
          nav_node_id: string | null;
          status: string;
          error_text: string | null;
          created_at: string;
        }[],
    ),
    supabase
      .from("notification_dismissals")
      .select("source_kind, source_id")
      .eq("user_id", user.id)
      .then(
        (r) =>
          (r.data ?? []) as {
            source_kind: "queue" | "run";
            source_id: string;
          }[],
      ),
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
        workspace_id: q.workspace_id,
        title: q.title,
        sub: q.state,
        state: q.state,
        business_id: q.business_id,
        nav_node_id: q.nav_node_id,
        created_at: q.created_at,
      })),
    ...runs
      .filter((r) => !dismissedRuns.has(r.id))
      .map((r) => ({
        kind: "run" as const,
        id: r.id,
        workspace_id: r.workspace_id,
        title: r.error_text ?? "Run failed",
        sub: r.status,
        state: r.status,
        business_id: r.business_id,
        nav_node_id: r.nav_node_id,
        created_at: r.created_at,
      })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const translated = locale
    ? await translateNotificationItems(items, locale, user.id)
    : items;

  return NextResponse.json({ items: translated });
}

function normalizeLocale(value: string | null): Locale | null {
  return value && LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

async function translateNotificationItems(
  items: Notif[],
  locale: Locale,
  userId: string,
): Promise<Notif[]> {
  const copies = items.map((item) => ({ ...item }));
  const groups = new Map<
    string,
    {
      workspaceId: string;
      businessId: string | null;
      navNodeId: string | null;
      items: Notif[];
    }
  >();

  for (const item of copies) {
    const key = [
      item.workspace_id,
      item.business_id ?? "",
      item.nav_node_id ?? "",
    ].join(":");
    const group = groups.get(key) ?? {
      workspaceId: item.workspace_id,
      businessId: item.business_id,
      navNodeId: item.nav_node_id,
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const inputs: Array<{
      sourceKind: string;
      sourceId: string;
      field: string;
      text: string;
    }> = [];
    const setters: Array<(value: string) => void> = [];
    for (const item of group.items) {
      inputs.push({
        sourceKind: item.kind === "queue" ? "queue_item" : "run",
        sourceId: item.id,
        field: item.kind === "queue" ? "title" : "error_text",
        text: item.title,
      });
      setters.push((value) => {
        item.title = value;
      });
    }
    const values = await translateContentBatch(
      group.workspaceId,
      locale,
      inputs,
      {
        credentialOwnerUserId: userId,
        businessId: group.businessId,
        navNodeId: group.navNodeId,
      },
    );
    values.forEach((value, index) => setters[index]?.(value));
  }

  return copies;
}
