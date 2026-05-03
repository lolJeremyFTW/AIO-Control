// /[ws]/settings/weather — chip city + lat/lon for the header forecast.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import { WeatherSettings } from "../../../../components/WeatherSettings";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function WeatherSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("weather_city, weather_lat, weather_lon")
    .eq("id", workspace.id)
    .maybeSingle();

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.weather")}</h1>
        <span className="sub">{t("settings.section.weather.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.weather")}>
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
    </>
  );
}
