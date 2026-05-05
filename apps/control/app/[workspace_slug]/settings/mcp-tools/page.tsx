import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { listApiKeys } from "../../../actions/api-keys";
import { getDict } from "../../../../lib/i18n/server";
import { McpToolsSetupPanel } from "../../../../components/McpToolsSetupPanel";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function McpToolsSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const apiKeys = await listApiKeys(workspace.id);

  // Which MCP tool keys are already set at workspace scope?
  const keysSet = apiKeys
    .filter(
      (k) =>
        k.scope === "workspace" &&
        k.scope_id === workspace.id &&
        k.has_value,
    )
    .map((k) => k.provider);

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.mcpTools")}</h1>
        <span className="sub">{t("settings.section.mcpTools.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.mcpTools")}>
        <McpToolsSetupPanel
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          keysSet={keysSet}
        />
      </SettingsSectionCard>
    </>
  );
}
