// /[ws]/settings/integrations - workspace-level provider/service labels.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { getDict } from "../../../../lib/i18n/server";
import { listIntegrationsForWorkspace } from "../../../../lib/queries/integrations";
import { IntegrationsList } from "../../../../components/IntegrationsList";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function IntegrationsSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const integrations = await listIntegrationsForWorkspace(workspace.id);
  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.integrations")}</h1>
        <span className="sub">{t("settings.section.integrations.desc")}</span>
      </div>

      <IntegrationsList
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        integrations={integrations}
      />
    </>
  );
}
