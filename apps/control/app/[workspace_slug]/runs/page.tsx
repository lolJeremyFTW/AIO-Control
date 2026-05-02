// Workspace-wide runs feed — every run across every business + every
// agent in the user's workspace. Same component as the per-business
// runs page; we just hand it businessId=null + a name lookup map.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { listAgentsForWorkspace } from "../../../lib/queries/agents";
import { listBusinesses } from "../../../lib/queries/businesses";
import { RunsPage } from "../../../components/RunsPage";

type Props = {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ status?: string; agent?: string; offset?: string }>;
};

export default async function WorkspaceRunsPage({ params, searchParams }: Props) {
  const { workspace_slug } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, agents] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
  ]);

  const businessName = Object.fromEntries(
    businesses.map((b) => [b.id, b.name]),
  );

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Runs</h1>
        <span className="sub">Alle runs over alle businesses</span>
      </div>
      <RunsPage
        workspaceSlug={workspace_slug}
        workspaceId={workspace.id}
        businessId={null}
        agents={agents}
        businessName={businessName}
        statusFilter={sp.status ?? null}
        agentFilter={sp.agent ?? null}
        offset={Number(sp.offset ?? 0)}
      />
    </div>
  );
}
