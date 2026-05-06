// Schedules tab for a single business — list + create UI for cron / webhook
// / manual schedules, plus a recent-runs timeline.

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import { getDict } from "../../../../../lib/i18n/server";
import { listAgentsForWorkspace } from "../../../../../lib/queries/agents";
import { listBusinesses } from "../../../../../lib/queries/businesses";
import {
  listSchedulesForBusiness,
  listRecentRunsForBusiness,
} from "../../../../../lib/queries/schedules";
import { listFlatNavNodes } from "../../../../../lib/queries/nav-nodes";
import { RunsTimeline } from "../../../../../components/RunsTimeline";
import { ScheduleBuilder } from "../../../../../components/ScheduleBuilder";
import { SchedulesPanel } from "../../../../../components/SchedulesPanel";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessSchedulesPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    businesses,
    allAgents,
    schedules,
    runs,
    navNodes,
    hdrs,
    { data: telegramRows },
    { data: customRows },
  ] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
    listSchedulesForBusiness(bizId),
    listRecentRunsForBusiness(bizId, 12),
    listFlatNavNodes(bizId),
    headers(),
    supabase
      .from("telegram_targets")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .eq("enabled", true),
    supabase
      .from("custom_integrations")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .eq("enabled", true),
  ]);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();
  const agents = allAgents.filter((a) => a.business_id === bizId);
  const telegramTargets = (telegramRows ?? []) as { id: string; name: string }[];
  const customIntegrations = (customRows ?? []) as { id: string; name: string }[];

  // Build the public origin webhook URLs should resolve under. In production
  // this is whatever Caddy fronts (tromptech.life); in dev it falls back to
  // the request's own host.
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3010";
  const triggerOrigin =
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;

  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.business.schedules.h1", { business: biz.name })}</h1>
        <span className="sub">{t("page.business.schedules.sub")}</span>
      </div>
      {agents.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <ScheduleBuilder
            workspaceSlug={workspace.slug}
            workspaceId={workspace.id}
            businessId={biz.id}
            agents={agents}
            triggerOrigin={triggerOrigin}
            telegramTargets={telegramTargets}
            customIntegrations={customIntegrations}
          />
        </div>
      )}

      <SchedulesPanel
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        agents={agents}
        schedules={schedules}
        triggerOrigin={triggerOrigin}
        navNodes={navNodes}
        hideCreateForm={agents.length > 0}
      />

      <h2
        style={{
          fontFamily: "var(--hand)",
          fontSize: 22,
          fontWeight: 700,
          margin: "28px 0 10px",
        }}
      >
        Recente runs
      </h2>
      <RunsTimeline
        runs={runs}
        agents={agents}
        businessId={biz.id}
        workspaceId={biz.workspace_id}
      />
    </div>
  );
}
