// /[ws]/settings/danger — export workspace data, delete workspace.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { DangerZone } from "../../../../components/DangerZone";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function DangerSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspace.id)
    .maybeSingle();
  const isOwner = !!ws && ws.owner_id === user.id;

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.danger")}</h1>
        <span className="sub">{t("settings.section.danger.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.danger")}>
        <DangerZone
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          isOwner={isOwner}
        />
      </SettingsSectionCard>
    </>
  );
}
