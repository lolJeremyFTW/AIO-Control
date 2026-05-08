// /[ws]/settings/telegram — Telegram bot targets + topology.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { listApiKeys } from "../../../actions/api-keys";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { listBusinesses } from "../../../../lib/queries/businesses";
import type { NavNode } from "../../../../lib/queries/nav-nodes";
import { ProviderSetupKit } from "../../../../components/ProviderSetupKit";
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
  const hdrsPromise = headers();
  const [
    businesses,
    { data: navRows },
    { data: telegramRows },
    { data: ws },
    apiKeys,
    hdrs,
  ] = await Promise.all([
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
    listApiKeys(workspace.id),
    hdrsPromise,
  ]);

  const { t } = await getDict();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "aio.tromptech.life";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const publicOrigin =
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;
  const configuredKeys = new Set(
    apiKeys.filter((key) => key.has_value).map((key) => key.provider),
  );

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
        <ProviderSetupKit
          publicOrigin={publicOrigin}
          workspaceSlug={workspace.slug}
          initialProvider="telegram"
          visibleProviders={["telegram"]}
          setupStatus={{
            credentials: {
              telegram: configuredKeys.has("telegram"),
              telegram_webhook_secret: Boolean(
                process.env.TELEGRAM_WEBHOOK_SECRET,
              ),
              slack_bot_token: configuredKeys.has("slack_bot_token"),
              slack_signing_secret: configuredKeys.has("slack_signing_secret"),
              discord_bot_token: configuredKeys.has("discord_bot_token"),
              discord_public_key: configuredKeys.has("discord_public_key"),
            },
            targets: {
              telegram: telegramRows?.length ?? 0,
              slack: 0,
              discord: 0,
            },
          }}
        />
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
