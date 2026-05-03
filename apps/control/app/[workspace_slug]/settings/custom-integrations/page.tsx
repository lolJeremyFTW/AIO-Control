// /[ws]/settings/custom-integrations — generic webhooks / API calls.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { listBusinesses } from "../../../../lib/queries/businesses";
import type { NavNode } from "../../../../lib/queries/nav-nodes";
import {
  CustomIntegrationsPanel,
  type CustomIntegrationRow,
} from "../../../../components/CustomIntegrationsPanel";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function CustomIntegrationsSettingsPage({
  params,
}: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [businesses, { data: navRows }, { data: rows }] = await Promise.all([
    listBusinesses(workspace.id),
    supabase
      .from("nav_nodes")
      .select(
        "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, color_hex, logo_url, href, sort_order",
      )
      .eq("workspace_id", workspace.id)
      .is("archived_at", null),
    supabase
      .from("custom_integrations")
      .select(
        "id, scope, scope_id, name, url, method, headers, body_template, on_run_done, on_run_fail, on_queue_review, enabled",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
  ]);

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.customIntegrations")}</h1>
        <span className="sub">
          {t("settings.section.customIntegrations.desc")}
        </span>
      </div>

      <SettingsSectionCard title={t("settings.section.customIntegrations")}>
        <CustomIntegrationsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialItems={(rows ?? []) as CustomIntegrationRow[]}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
        />
      </SettingsSectionCard>
    </>
  );
}
