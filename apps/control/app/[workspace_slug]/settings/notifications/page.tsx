// /[ws]/settings/notifications - all outgoing notification targets.

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { isEmailConfigured } from "../../../../lib/notify/email";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { listBusinesses } from "../../../../lib/queries/businesses";
import type { NavNode } from "../../../../lib/queries/nav-nodes";
import { listApiKeys } from "../../../actions/api-keys";
import type { NotificationTargetRow } from "../../../actions/notification-targets";
import {
  CustomIntegrationsPanel,
  type CustomIntegrationRow,
} from "../../../../components/CustomIntegrationsPanel";
import { EmailNotifsPanel } from "../../../../components/EmailNotifsPanel";
import { NotificationTargetsPanel } from "../../../../components/NotificationTargetsPanel";
import { NotificationsButton } from "../../../../components/NotificationsButton";
import { ProviderSetupKit } from "../../../../components/ProviderSetupKit";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import {
  TelegramPanel,
  type TelegramTargetRow,
} from "../../../../components/TelegramPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

type TelegramTopology =
  | "manual"
  | "topic_per_business"
  | "topic_per_business_and_node";

export default async function NotificationsSettingsPage({ params }: Props) {
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
    { data: channelRows },
    { data: telegramRows },
    { data: customRows },
    { data: ws },
    apiKeys,
    smtpConfigured,
    hdrs,
    { t },
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
      .from("notification_targets")
      .select(
        "id, provider, scope, scope_id, name, config, allowlist, denylist, send_run_done, send_run_fail, send_queue_review, enabled",
      )
      .eq("workspace_id", workspace.id)
      .in("provider", ["slack", "discord"])
      .order("created_at", { ascending: true }),
    supabase
      .from("telegram_targets")
      .select(
        "id, scope, scope_id, name, chat_id, topic_id, allowlist, denylist, send_run_done, send_run_fail, send_queue_review, enabled, auto_create_topics_for_businesses",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("custom_integrations")
      .select(
        "id, scope, scope_id, name, url, method, headers, body_template, on_run_done, on_run_fail, on_queue_review, enabled",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspaces")
      .select(
        "telegram_topology, notify_email, notify_email_on_done, notify_email_on_fail",
      )
      .eq("id", workspace.id)
      .maybeSingle(),
    listApiKeys(workspace.id),
    isEmailConfigured(workspace.id),
    hdrsPromise,
    getDict(),
  ]);

  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "aio.tromptech.life";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const publicOrigin =
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? `${proto}://${host}`;
  const configuredKeys = new Set(
    apiKeys.filter((key) => key.has_value).map((key) => key.provider),
  );
  const channels = (channelRows ?? []) as NotificationTargetRow[];
  const telegramTargets = (telegramRows ?? []) as TelegramTargetRow[];
  const topology =
    (ws?.telegram_topology as TelegramTopology | null | undefined) ?? "manual";

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.notifications")}</h1>
        <span className="sub">{t("settings.section.notifications.desc")}</span>
      </div>

      <SettingsSectionCard id="channels" title={t("settings.section.channels")}>
        <ProviderSetupKit
          publicOrigin={publicOrigin}
          workspaceSlug={workspace.slug}
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
              telegram: telegramTargets.length,
              slack: channels.filter((row) => row.provider === "slack").length,
              discord: channels.filter((row) => row.provider === "discord")
                .length,
            },
          }}
        />
        <NotificationTargetsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialTargets={channels}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
        />
      </SettingsSectionCard>

      <SettingsSectionCard id="telegram" title={t("settings.section.telegram")}>
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
              telegram: telegramTargets.length,
              slack: 0,
              discord: 0,
            },
          }}
        />
        <TelegramPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialTargets={telegramTargets}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
          initialTopology={topology}
        />
      </SettingsSectionCard>

      <SettingsSectionCard id="email" title={t("settings.section.email")}>
        <EmailNotifsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initial={{
            email: (ws?.notify_email as string | null) ?? null,
            on_done: (ws?.notify_email_on_done as boolean | null) ?? false,
            on_fail: (ws?.notify_email_on_fail as boolean | null) ?? true,
          }}
          smtpConfigured={smtpConfigured}
        />
      </SettingsSectionCard>

      <SettingsSectionCard
        id="browser"
        title={t("settings.section.browserNotifications")}
      >
        <NotificationsButton />
      </SettingsSectionCard>

      <SettingsSectionCard
        id="custom-integrations"
        title={t("settings.section.customIntegrations")}
      >
        <CustomIntegrationsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialItems={(customRows ?? []) as CustomIntegrationRow[]}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
        />
      </SettingsSectionCard>
    </>
  );
}
