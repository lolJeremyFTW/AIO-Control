// /[ws]/settings/telegram — Telegram bot targets + topology.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { listBusinesses } from "../../../../lib/queries/businesses";
import type { NavNode } from "../../../../lib/queries/nav-nodes";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import {
  TelegramPanel,
  type TelegramTargetRow,
} from "../../../../components/TelegramPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function TelegramSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [businesses, { data: navRows }, { data: telegramRows }, { data: ws }] =
    await Promise.all([
      listBusinesses(workspace.id),
      supabase
        .from("nav_nodes")
        .select(
          "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, color_hex, logo_url, href, sort_order",
        )
        .eq("workspace_id", workspace.id)
        .is("archived_at", null),
      supabase
        .from("telegram_targets")
        .select(
          "id, scope, scope_id, name, chat_id, topic_id, allowlist, denylist, send_run_done, send_run_fail, send_queue_review, enabled, auto_create_topics_for_businesses",
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("workspaces")
        .select("telegram_topology")
        .eq("id", workspace.id)
        .maybeSingle(),
    ]);

  const { t } = await getDict();

  type Topology =
    | "manual"
    | "topic_per_business"
    | "topic_per_business_and_node";
  const topology: Topology =
    (ws?.telegram_topology as Topology | null | undefined) ?? "manual";

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.telegram")}</h1>
        <span className="sub">{t("settings.section.telegram.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.telegram")}>
        <TelegramPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialTargets={(telegramRows ?? []) as TelegramTargetRow[]}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
          initialTopology={topology}
        />
      </SettingsSectionCard>
    </>
  );
}
