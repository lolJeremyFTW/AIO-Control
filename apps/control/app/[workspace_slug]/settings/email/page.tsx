// /[ws]/settings/email — SMTP target + which run-events fire emails.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { isEmailConfigured } from "../../../../lib/notify/email";
import { EmailNotifsPanel } from "../../../../components/EmailNotifsPanel";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function EmailSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("notify_email, notify_email_on_done, notify_email_on_fail")
    .eq("id", workspace.id)
    .maybeSingle();

  const smtpConfigured = await isEmailConfigured(workspace.id);
  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.email")}</h1>
        <span className="sub">{t("settings.section.email.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.email")}>
        <EmailNotifsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initial={{
            email: (ws?.notify_email as string | null) ?? null,
            on_done:
              (ws?.notify_email_on_done as boolean | null) ?? false,
            on_fail:
              (ws?.notify_email_on_fail as boolean | null) ?? true,
          }}
          smtpConfigured={smtpConfigured}
        />
      </SettingsSectionCard>
    </>
  );
}
