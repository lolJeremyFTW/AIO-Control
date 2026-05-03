// /[ws]/settings/spend-limits — workspace daily/monthly caps + the
// auto-pause toggle. Per-business limits live on the business edit
// dialog; this page is the workspace floor.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import { SpendLimitsPanel } from "../../../../components/SpendLimitsPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function SpendLimitsSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select(
      "daily_spend_limit_cents, monthly_spend_limit_cents, auto_pause_on_limit",
    )
    .eq("id", workspace.id)
    .maybeSingle();

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.spendLimits")}</h1>
        <span className="sub">{t("settings.section.spendLimits.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.spendLimits")}>
        <SpendLimitsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initial={{
            daily_cents:
              (ws?.daily_spend_limit_cents as number | null) ?? null,
            monthly_cents:
              (ws?.monthly_spend_limit_cents as number | null) ?? null,
            auto_pause:
              (ws?.auto_pause_on_limit as boolean | null) ?? true,
          }}
        />
      </SettingsSectionCard>
    </>
  );
}
