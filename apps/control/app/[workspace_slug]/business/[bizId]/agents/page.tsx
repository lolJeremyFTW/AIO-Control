// Agent list for a single business — phase 5 surfaces the agents the user
// can chat with through ChatPanel and (in fase 6) attach schedules to.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import { listAgentsForWorkspace } from "../../../../../lib/queries/agents";
import { listBusinesses } from "../../../../../lib/queries/businesses";
import { AgentsList } from "../../../../../components/AgentsList";
import { BusinessTabs } from "../../../../../components/BusinessTabs";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessAgentsPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, allAgents] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
  ]);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();
  const agents = allAgents.filter((a) => a.business_id === bizId);

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{biz.name} — agents</h1>
        <span className="sub">Providers · prompts · schedules</span>
      </div>
      <BusinessTabs workspaceSlug={workspace_slug} businessId={biz.id} />
      <AgentsList
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        agents={agents}
      />
    </div>
  );
}
