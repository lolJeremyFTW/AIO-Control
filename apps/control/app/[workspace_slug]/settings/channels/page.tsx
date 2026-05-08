// /[ws]/settings/channels - Slack and Discord notification targets.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import { NotificationTargetsPanel } from "../../../../components/NotificationTargetsPanel";
import { ProviderSetupKit } from "../../../../components/ProviderSetupKit";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { getDict } from "../../../../lib/i18n/server";
import { listBusinesses } from "../../../../lib/queries/businesses";
import type { NavNode } from "../../../../lib/queries/nav-nodes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import type { NotificationTargetRow } from "../../../actions/notification-targets";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function ChannelsSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const hdrsPromise = headers();
  const [businesses, { data: navRows }, { data: rows }, { t }, hdrs] =
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
        .from("notification_targets")
        .select(
          "id, provider, scope, scope_id, name, config, allowlist, denylist, send_run_done, send_run_fail, send_queue_review, enabled",
        )
        .eq("workspace_id", workspace.id)
        .in("provider", ["slack", "discord"])
        .order("created_at", { ascending: true }),
      getDict(),
      hdrsPromise,
    ]);
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "aio.tromptech.life";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const publicOrigin =
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.channels")}</h1>
        <span className="sub">{t("settings.section.channels.desc")}</span>
      </div>

      <SettingsSectionCard title={t("settings.section.channels")}>
        <ProviderSetupKit
          publicOrigin={publicOrigin}
          workspaceSlug={workspace.slug}
        />
        <NotificationTargetsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialTargets={(rows ?? []) as NotificationTargetRow[]}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
        />
      </SettingsSectionCard>
    </>
  );
}
