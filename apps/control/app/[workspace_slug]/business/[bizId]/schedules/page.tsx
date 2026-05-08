// Schedules tab for a single business — list + create UI for cron / webhook
// / manual schedules, plus a recent-runs timeline.

import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import { getDict } from "../../../../../lib/i18n/server";
import { listAgentsForWorkspace } from "../../../../../lib/queries/agents";
import {
  listBusinesses,
  findBusiness,
} from "../../../../../lib/queries/businesses";
import {
  listSchedulesForBusiness,
  listRecentRunsForBusiness,
} from "../../../../../lib/queries/schedules";
import { listFlatNavNodes } from "../../../../../lib/queries/nav-nodes";
import {
  listNotificationBindingsForOwners,
  listSlackDiscordNotificationTargets,
} from "../../../../../lib/queries/notification-targets";
import { RunsTimeline } from "../../../../../components/RunsTimeline";
import { ScheduleBuilderDialog } from "../../../../../components/ScheduleBuilderDialog";
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
    hdrs,
    notificationTargets,
    { data: telegramRows },
    { data: customRows },
  ] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
    headers(),
    listSlackDiscordNotificationTargets(workspace.id),
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
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();
  const [schedules, runs, navNodes, { data: pipelineConfig }] =
    await Promise.all([
      listSchedulesForBusiness(biz.id),
      listRecentRunsForBusiness(biz.id, 12),
      listFlatNavNodes(biz.id),
      supabase
        .from("outreach_pipeline_configs")
        .select(
          "id, enabled, interval_seconds, batch_size, total_outreached_count",
        )
        .eq("workspace_id", workspace.id)
        .eq("business_id", biz.id)
        .maybeSingle(),
    ]);
  const agents = allAgents.filter(
    (a) => a.business_id === biz.id || a.business_id === null,
  );
  const telegramTargets = (telegramRows ?? []) as {
    id: string;
    name: string;
  }[];
  const customIntegrations = (customRows ?? []) as {
    id: string;
    name: string;
  }[];
  const notificationTargetBindings = await listNotificationBindingsForOwners(
    workspace.id,
    schedules.map((schedule) => ({
      owner_type: "schedule",
      owner_id: schedule.id,
    })),
  );

  // Build the public origin webhook URLs should resolve under. In production
  // this is whatever Caddy fronts (tromptech.life); in dev it falls back to
  // the request's own host.
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3010";
  const triggerOrigin =
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;

  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.business.schedules.h1", { business: biz.name })}</h1>
        {agents.length > 0 && (
          <ScheduleBuilderDialog
            workspaceSlug={workspace.slug}
            workspaceId={workspace.id}
            businessId={biz.id}
            agents={agents}
            triggerOrigin={triggerOrigin}
            telegramTargets={telegramTargets}
            customIntegrations={customIntegrations}
            notificationTargets={notificationTargets}
            navNodes={navNodes}
          />
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 16,
          margin: "0 0 18px",
          padding: 16,
          border: "1.5px solid var(--app-border)",
          borderRadius: 8,
          background: "var(--app-card)",
        }}
      >
        <div>
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 0,
            }}
          >
            Outreach pipeline
          </h2>
          <p className="sub" style={{ margin: 0 }}>
            Silent loop naast cron jobs met agent-pings, QA gate en duplicate
            checks.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <span
            style={{
              padding: "7px 10px",
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              background: "var(--app-card-2)",
            }}
          >
            {pipelineConfig?.enabled ? "Actief" : "Gepauzeerd"}
          </span>
          <span
            style={{
              padding: "7px 10px",
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              background: "var(--app-card-2)",
            }}
          >
            {pipelineConfig?.total_outreached_count ?? 0} outreached
          </span>
          <Link
            href={`/${workspace.slug}/business/${biz.slug}/outreach-pipeline`}
            style={{
              padding: "9px 14px",
              border: "1.5px solid var(--app-fg)",
              borderRadius: 8,
              background: "var(--app-fg)",
              color: "var(--app-bg)",
              fontWeight: 800,
              fontSize: 13,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {pipelineConfig ? "Open pipeline" : "Pipeline aanmaken"}
          </Link>
        </div>
      </div>

      <SchedulesPanel
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        agents={agents}
        schedules={schedules}
        triggerOrigin={triggerOrigin}
        navNodes={navNodes}
        telegramTargets={telegramTargets}
        customIntegrations={customIntegrations}
        notificationTargets={notificationTargets}
        notificationTargetBindings={notificationTargetBindings}
        hideCreateForm={agents.length > 0}
      />

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          margin: "28px 0 10px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
          }}
        >
          Recente runs
        </h2>
        <Link
          href={`/${workspace.slug}/business/${biz.slug}/runs`}
          style={{
            padding: "8px 14px",
            border: "1.5px solid var(--app-border)",
            background: "var(--app-card-2)",
            color: "var(--app-fg)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            textDecoration: "none",
          }}
        >
          Alle runs
        </Link>
      </div>
      <RunsTimeline
        runs={runs}
        agents={agents}
        schedules={schedules}
        businessId={biz.id}
        workspaceId={biz.workspace_id}
      />
    </div>
  );
}
