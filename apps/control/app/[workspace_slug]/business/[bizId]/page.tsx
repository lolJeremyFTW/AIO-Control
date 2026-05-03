// Business detail dashboard — KPIs + open queue + agents + recent runs
// in one page. The dedicated /agents, /schedules, /integrations tabs
// remain for deeper interaction.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { listAgentsForWorkspace } from "../../../../lib/queries/agents";
import {
  listBusinesses,
  listKpisForWorkspace,
  listOpenQueueItems,
} from "../../../../lib/queries/businesses";
import { listRecentRunsForBusiness } from "../../../../lib/queries/schedules";
import { getDict } from "../../../../lib/i18n/server";
import { BusinessDashboard } from "../../../../components/BusinessDashboard";
import { PauseToggle } from "../../../../components/PauseToggle";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, queue, kpis, agents, runs] = await Promise.all([
    listBusinesses(workspace.id),
    listOpenQueueItems(workspace.id, bizId, 6),
    listKpisForWorkspace(workspace.id),
    listAgentsForWorkspace(workspace.id),
    listRecentRunsForBusiness(bizId, 5),
  ]);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();
  const bizKpis = kpis.filter((k) => k.business_id === bizId);
  const bizAgents = agents.filter((a) => a.business_id === bizId);
  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        {/* Just the business name. The icon is a registry-key string
            (e.g. "video"), not an emoji — concatenating it leaks the
            literal "video " prefix into the heading. The actual SVG
            icon is already rendered in the rail row + breadcrumb. */}
        <h1>{biz.name}</h1>
        <span className="sub">
          {biz.sub ?? t("page.business.overview.sub")}
        </span>
      </div>

      <div style={{ marginBottom: 18 }}>
        <PauseToggle
          workspaceSlug={workspace_slug}
          businessId={biz.id}
          status={biz.status as "running" | "paused"}
        />
      </div>

      <BusinessDashboard
        workspaceSlug={workspace.slug}
        business={biz}
        kpis={bizKpis}
        queue={queue}
        agents={bizAgents}
        runs={runs}
      />
    </div>
  );
}
