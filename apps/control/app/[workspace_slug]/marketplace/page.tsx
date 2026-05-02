// AI agent marketplace page. Lists curated presets — clicking install
// copies the entry into a chosen business.

import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { listBusinesses } from "../../../lib/queries/businesses";
import { listMarketplace } from "../../../lib/queries/marketplace";
import { MarketplaceGrid } from "../../../components/MarketplaceGrid";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function MarketplacePage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) redirect("/login");

  const [businesses, agents] = await Promise.all([
    listBusinesses(workspace.id),
    listMarketplace(),
  ]);

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Marketplace</h1>
        <span className="sub">Curated AI agent presets</span>
      </div>
      <MarketplaceGrid
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businesses={businesses}
        agents={agents}
      />
    </div>
  );
}
