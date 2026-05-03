// Cost dashboard — workspace-wide spend / runs / failures across all
// businesses, agents, providers. Reads from the cost_* views which
// pre-aggregate the runs table over 24h / 7d / 30d windows.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { getDict } from "../../../lib/i18n/server";
import { listAgentsForWorkspace } from "../../../lib/queries/agents";
import { listBusinesses } from "../../../lib/queries/businesses";
import {
  CostDashboard,
  type CostByAgentRow,
  type CostByBusinessRow,
  type CostByProviderRow,
  type TimelineRow,
} from "../../../components/CostDashboard";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function WorkspaceCostPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    businesses,
    agents,
    { data: byBusiness },
    { data: byAgent },
    { data: byProvider },
    { data: timeline },
  ] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
    supabase
      .from("cost_by_business")
      .select("*")
      .eq("workspace_id", workspace.id),
    supabase
      .from("cost_by_agent")
      .select("*")
      .eq("workspace_id", workspace.id),
    supabase
      .from("cost_by_provider")
      .select("*")
      .eq("workspace_id", workspace.id),
    supabase
      .from("cost_timeline_30d")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("day", { ascending: true }),
  ]);

  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.cost")}</h1>
        <span className="sub">{t("page.cost.sub")}</span>
      </div>
      <CostDashboard
        businesses={businesses}
        agents={agents}
        byBusiness={(byBusiness ?? []) as CostByBusinessRow[]}
        byAgent={(byAgent ?? []) as CostByAgentRow[]}
        byProvider={(byProvider ?? []) as CostByProviderRow[]}
        timeline={(timeline ?? []) as TimelineRow[]}
      />
    </div>
  );
}
