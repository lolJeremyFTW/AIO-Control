// Workspace-wide activity feed. Reads audit_logs (populated by the
// _audit_row trigger on businesses/agents/schedules/members/etc) and
// renders a chronological list with actor + resource + action labels.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { getDict } from "../../../lib/i18n/server";
import { ActivityFeed } from "../../../components/ActivityFeed";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Props = {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ table?: string; offset?: string }>;
};

export default async function ActivityPage({ params, searchParams }: Props) {
  const { workspace_slug } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("audit_logs")
    .select("id, action, resource_table, resource_id, payload, actor_id, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (sp.table) q = q.eq("resource_table", sp.table);
  const { data: logs } = await q;

  // Pull profile names for the actors in this batch in one query so we
  // can render "Jeremy edited Faceless YouTube" instead of UUIDs.
  const actorIds = Array.from(
    new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean) as string[]),
  );
  const { data: profiles } = actorIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds)
    : { data: [] };
  const actorName = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.display_name]),
  );
  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.activity")}</h1>
        <span className="sub">{t("page.activity.sub")}</span>
      </div>
      <ActivityFeed
        workspaceSlug={workspace_slug}
        items={(logs ?? []) as Parameters<typeof ActivityFeed>[0]["items"]}
        actorName={actorName}
        activeTable={sp.table ?? null}
      />
    </div>
  );
}
