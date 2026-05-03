// /[ws]/settings/notifications — Web Push for HITL items on this device.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { getDict } from "../../../../lib/i18n/server";
import { NotificationsButton } from "../../../../components/NotificationsButton";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function NotificationsSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.notifications")}</h1>
        <span className="sub">{t("settings.section.notifs.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.notifications")}>
        <NotificationsButton />
      </SettingsSectionCard>
    </>
  );
}
