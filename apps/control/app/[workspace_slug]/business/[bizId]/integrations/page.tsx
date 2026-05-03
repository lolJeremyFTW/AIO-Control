// Per-business integrations tab. Shows business-scoped + workspace-scoped
// integrations together so the operator sees everything that's wired in
// without flipping pages.

import { notFound, redirect } from "next/navigation";

import { getCurrentUser, getWorkspaceBySlug } from "../../../../../lib/auth/workspace";
import { listBusinesses } from "../../../../../lib/queries/businesses";
import { listIntegrationsForBusiness } from "../../../../../lib/queries/integrations";
import { IntegrationsList } from "../../../../../components/IntegrationsList";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessIntegrationsPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, integrations] = await Promise.all([
    listBusinesses(workspace.id),
    listIntegrationsForBusiness(workspace.id, bizId),
  ]);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{biz.name} — integraties</h1>
        <span className="sub">External services this business uses</span>
      </div>
      <IntegrationsList
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        integrations={integrations}
      />
    </div>
  );
}
