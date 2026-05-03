// /[ws]/settings/ollama — local Ollama host + port + scan + model cache.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { OllamaPanel } from "../../../../components/OllamaPanel";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function OllamaSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select(
      "ollama_host, ollama_port, ollama_models_cached, ollama_last_scan_at",
    )
    .eq("id", workspace.id)
    .maybeSingle();

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.ollama")}</h1>
        <span className="sub">{t("settings.section.ollama.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.ollama")}>
        <OllamaPanel
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          initial={{
            host: (ws?.ollama_host as string | null) ?? null,
            port: (ws?.ollama_port as number | null) ?? null,
            models:
              (ws?.ollama_models_cached as
                | { name: string; size: number; modified_at: string }[]
                | null) ?? [],
            lastScanAt: (ws?.ollama_last_scan_at as string | null) ?? null,
          }}
        />
      </SettingsSectionCard>
    </>
  );
}
