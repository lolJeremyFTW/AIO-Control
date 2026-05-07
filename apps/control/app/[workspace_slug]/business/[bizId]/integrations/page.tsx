// Per-business integrations tab. Shows business-scoped + workspace-scoped
// integrations together so the operator sees everything that's wired in
// without flipping pages.

import { notFound, redirect } from "next/navigation";

import { getCurrentUser, getWorkspaceBySlug } from "../../../../../lib/auth/workspace";
import { getDict } from "../../../../../lib/i18n/server";
import { listBusinesses, findBusiness } from "../../../../../lib/queries/businesses";
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

  const businesses = await listBusinesses(workspace.id);
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();
  const integrations = await listIntegrationsForBusiness(workspace.id, biz.id);

  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.business.integrations.h1", { business: biz.name })}</h1>
        <span className="sub">{t("page.business.integrations.sub")}</span>
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
