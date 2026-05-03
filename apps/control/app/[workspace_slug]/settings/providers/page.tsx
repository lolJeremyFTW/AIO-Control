// /[ws]/settings/providers — guided onboarding for self-hosted
// providers (Hermes-agent, OpenClaw, Ollama). Each card walks the user
// through the steps to get that provider answering chats: enter URL,
// click "test connection", save. No more "your agent says it doesn't
// know what system it's running in" foot-guns.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { ProvidersOnboardingPanel } from "../../../../components/ProvidersOnboardingPanel";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function ProvidersSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select(
      "ollama_host, ollama_port, ollama_models_cached, ollama_last_scan_at, hermes_endpoint, hermes_last_test_at, hermes_agent_name, hermes_agent_initialized_at, openclaw_endpoint, openclaw_last_test_at, openclaw_agent_name, openclaw_agent_initialized_at",
    )
    .eq("id", workspace.id)
    .maybeSingle();

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.providers")}</h1>
        <span className="sub">{t("settings.section.providers.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.providers")}>
        <ProvidersOnboardingPanel
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          initial={{
            ollama_host: (ws?.ollama_host as string | null) ?? null,
            ollama_port: (ws?.ollama_port as number | null) ?? null,
            ollama_models_count: Array.isArray(ws?.ollama_models_cached)
              ? (ws?.ollama_models_cached as unknown[]).length
              : 0,
            ollama_last_scan_at:
              (ws?.ollama_last_scan_at as string | null) ?? null,
            hermes_endpoint:
              (ws?.hermes_endpoint as string | null) ?? null,
            hermes_last_test_at:
              (ws?.hermes_last_test_at as string | null) ?? null,
            hermes_agent_name:
              (ws?.hermes_agent_name as string | null) ?? null,
            hermes_agent_initialized_at:
              (ws?.hermes_agent_initialized_at as string | null) ?? null,
            openclaw_endpoint:
              (ws?.openclaw_endpoint as string | null) ?? null,
            openclaw_last_test_at:
              (ws?.openclaw_last_test_at as string | null) ?? null,
            openclaw_agent_name:
              (ws?.openclaw_agent_name as string | null) ?? null,
            openclaw_agent_initialized_at:
              (ws?.openclaw_agent_initialized_at as string | null) ?? null,
          }}
        />
      </SettingsSectionCard>
    </>
  );
}
