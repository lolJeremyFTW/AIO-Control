// /[ws]/settings/general — workspace name, email, timezone, sign-out.
//
// The simplest section: read-only summary plus the sign-out form. Edits
// to workspace name/timezone/email live in dedicated panels (profile
// editor, workspace switcher) for now.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { getDict } from "../../../../lib/i18n/server";
import { signOutAction } from "../../../(auth)/actions";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function GeneralSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.general")}</h1>
        <span className="sub">{t("settings.section.general.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.general")}>
        <SettingsRow
          label={t("settings.field.workspaceName")}
          value={workspace.name}
        />
        <SettingsRow
          label={t("settings.field.email")}
          value={user.email ?? "—"}
        />
        <SettingsRow
          label={t("settings.field.timezone")}
          value="Europe/Amsterdam"
        />
        <form action={signOutAction} style={{ marginTop: 14 }}>
          <button
            type="submit"
            style={{
              padding: "8px 14px",
              border: "1.5px solid var(--rose)",
              background: "transparent",
              color: "var(--rose)",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            {t("common.signOut")}
          </button>
        </form>
      </SettingsSectionCard>
    </>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        alignItems: "center",
        gap: 14,
        padding: "12px 0",
        borderTop: "1px solid var(--app-border-2)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--app-fg-2)" }}>{value}</div>
    </div>
  );
}
