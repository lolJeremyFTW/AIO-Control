// /[ws]/settings/workspace - consolidated workspace basics.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getProfile,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { listIntegrationsForWorkspace } from "../../../../lib/queries/integrations";
import { listWorkspaceMembers } from "../../../../lib/queries/members";
import { signOutAction } from "../../../(auth)/actions";
import { IntegrationsList } from "../../../../components/IntegrationsList";
import { ServerFilesBrowser } from "../../../../components/ServerFilesBrowser";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import { TeamPanel } from "../../../../components/TeamPanel";
import { WeatherSettings } from "../../../../components/WeatherSettings";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function WorkspaceSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [profile, members, integrations, { data: ws }, { t }] =
    await Promise.all([
      getProfile(user.id),
      listWorkspaceMembers(workspace.id),
      listIntegrationsForWorkspace(workspace.id),
      supabase
        .from("workspaces")
        .select("weather_city, weather_lat, weather_lon")
        .eq("id", workspace.id)
        .maybeSingle(),
      getDict(),
    ]);

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.workspace")}</h1>
        <span className="sub">{t("settings.section.workspace.desc")}</span>
      </div>

      <SettingsSectionCard id="general" title={t("settings.section.general")}>
        <SettingsRow
          label={t("settings.field.workspaceName")}
          value={workspace.name}
        />
        <SettingsRow
          label={t("settings.field.email")}
          value={user.email ?? "-"}
        />
        <SettingsRow
          label={t("settings.field.timezone")}
          value="Europe/Amsterdam"
        />
        <form action={signOutAction} style={{ marginTop: 14 }}>
          <button type="submit" className="btn danger">
            {t("common.signOut")}
          </button>
        </form>
      </SettingsSectionCard>

      <SettingsSectionCard id="team" title={t("settings.section.team")}>
        <TeamPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          members={members}
          currentUserId={user.id}
        />
      </SettingsSectionCard>

      <SettingsSectionCard id="weather" title={t("settings.section.weather")}>
        <WeatherSettings
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          initial={{
            city: (ws?.weather_city as string | null) ?? "Breda",
            lat: Number(ws?.weather_lat ?? 51.589),
            lon: Number(ws?.weather_lon ?? 4.776),
          }}
        />
      </SettingsSectionCard>

      <section id="integrations" style={{ scrollMarginTop: 16 }}>
        <IntegrationsList
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          integrations={integrations}
        />
      </section>

      {profile?.is_admin && (
        <SettingsSectionCard
          id="server-files"
          title={t("settings.section.serverFiles")}
          desc={t("settings.section.serverFiles.desc")}
        >
          <ServerFilesBrowser />
        </SettingsSectionCard>
      )}
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
