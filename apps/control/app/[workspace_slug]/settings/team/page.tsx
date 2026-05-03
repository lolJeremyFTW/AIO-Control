// /[ws]/settings/team — workspace members + roles.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { getDict } from "../../../../lib/i18n/server";
import { listWorkspaceMembers } from "../../../../lib/queries/members";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import { TeamPanel } from "../../../../components/TeamPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function TeamSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const members = await listWorkspaceMembers(workspace.id);
  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.team")}</h1>
        <span className="sub">{t("settings.section.team.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.team")}>
        <TeamPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          members={members}
          currentUserId={user.id}
        />
      </SettingsSectionCard>
    </>
  );
}
