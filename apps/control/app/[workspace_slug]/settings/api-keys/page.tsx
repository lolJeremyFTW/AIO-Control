// /[ws]/settings/api-keys — workspace defaults + per-business / per-
// topic overrides for every provider key. The actual encryption +
// rotation lives in lib/api-keys; this page just renders the panel.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { listApiKeys } from "../../../actions/api-keys";
import { listBusinesses } from "../../../../lib/queries/businesses";
import type { NavNode } from "../../../../lib/queries/nav-nodes";
import { ApiKeysPanel } from "../../../../components/ApiKeysPanel";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function ApiKeysSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [apiKeys, businesses, { data: navRows }] = await Promise.all([
    listApiKeys(workspace.id),
    listBusinesses(workspace.id),
    supabase
      .from("nav_nodes")
      .select(
        "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, color_hex, logo_url, href, sort_order",
      )
      .eq("workspace_id", workspace.id)
      .is("archived_at", null),
  ]);

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.apiKeys")}</h1>
        <span className="sub">{t("settings.section.apiKeys.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.apiKeys")}>
        <ApiKeysPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialKeys={apiKeys}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
        />
      </SettingsSectionCard>
    </>
  );
}
