// /[ws]/settings/agent-defaults — provider / model / system-prompt the
// new-agent dialog pre-fills with. Per-business or per-agent overrides
// stay where they are; this is the workspace-wide baseline.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import { WorkspaceDefaultsPanel } from "../../../../components/WorkspaceDefaultsPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function AgentDefaultsSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("default_provider, default_model, default_system_prompt")
    .eq("id", workspace.id)
    .maybeSingle();

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.agentDefaults")}</h1>
        <span className="sub">{t("settings.section.agentDefaults.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.agentDefaults")}>
        <WorkspaceDefaultsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initial={{
            provider: (ws?.default_provider as string | null) ?? null,
            model: (ws?.default_model as string | null) ?? null,
            system_prompt:
              (ws?.default_system_prompt as string | null) ?? null,
          }}
        />
      </SettingsSectionCard>
    </>
  );
}
