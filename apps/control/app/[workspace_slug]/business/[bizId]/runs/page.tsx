// All runs across every agent in this business — paginated, with
// filters for status. Useful for monitoring and debugging when an
// agent has a Telegram report channel set but the user wants the full
// log.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import { listAgentsForWorkspace } from "../../../../../lib/queries/agents";
import { listBusinesses } from "../../../../../lib/queries/businesses";
import { BusinessTabs } from "../../../../../components/BusinessTabs";
import { RunsPage } from "../../../../../components/RunsPage";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
  searchParams: Promise<{ status?: string; agent?: string; offset?: string }>;
};

export default async function BusinessRunsPage({ params, searchParams }: Props) {
  const { workspace_slug, bizId } = await params;
  const sp = await searchParams;
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
        <h1>{biz.name} — runs</h1>
        <span className="sub">Volledige run-historie van alle agents</span>
      </div>
      <BusinessTabs workspaceSlug={workspace_slug} businessId={biz.id} />
      <RunsPage
        workspaceSlug={workspace_slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        agents={agents}
        businessName={Object.fromEntries(businesses.map((b) => [b.id, b.name]))}
        statusFilter={sp.status ?? null}
        agentFilter={sp.agent ?? null}
        offset={Number(sp.offset ?? 0)}
      />
    </div>
  );
}
