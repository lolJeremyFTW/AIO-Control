// Workspace settings — General + Notifications + Team panels in one
// scrollable page. The section nav on the left is purely decorative for
// phase 7+ (clicking smooth-scrolls to the section anchor).

import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { getDict } from "../../../lib/i18n/server";
import { signOutAction } from "../../(auth)/actions";
import { listApiKeys } from "../../actions/api-keys";
import { ApiKeysPanel } from "../../../components/ApiKeysPanel";
import { EmailNotifsPanel } from "../../../components/EmailNotifsPanel";
import { OllamaPanel } from "../../../components/OllamaPanel";
import { SpendLimitsPanel } from "../../../components/SpendLimitsPanel";
import { WorkspaceDefaultsPanel } from "../../../components/WorkspaceDefaultsPanel";
import { isEmailConfigured } from "../../../lib/notify/email";
import {
  CustomIntegrationsPanel,
  type CustomIntegrationRow,
} from "../../../components/CustomIntegrationsPanel";
import { DangerZone } from "../../../components/DangerZone";
import { NotificationsButton } from "../../../components/NotificationsButton";
import { TeamPanel } from "../../../components/TeamPanel";
import {
  TelegramPanel,
  type TelegramTargetRow,
} from "../../../components/TelegramPanel";
import { WeatherSettings } from "../../../components/WeatherSettings";
import { listBusinesses } from "../../../lib/queries/businesses";
import { listWorkspaceMembers } from "../../../lib/queries/members";
import type { NavNode } from "../../../lib/queries/nav-nodes";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Props = { params: Promise<{ workspace_slug: string }> };

type SettingsNavEntry =
  | { kind: "anchor"; id: string; labelKey: string }
  | { kind: "page"; href: string; labelKey: string };

const SECTIONS: SettingsNavEntry[] = [
  { kind: "anchor", id: "general", labelKey: "settings.section.general" },
  { kind: "anchor", id: "agent-defaults", labelKey: "settings.section.agentDefaults" },
  { kind: "anchor", id: "weather", labelKey: "settings.section.weather" },
  { kind: "anchor", id: "ollama", labelKey: "settings.section.ollama" },
  { kind: "anchor", id: "api-keys", labelKey: "settings.section.apiKeys" },
  { kind: "anchor", id: "spend-limits", labelKey: "settings.section.spendLimits" },
  { kind: "anchor", id: "telegram", labelKey: "settings.section.telegram" },
  { kind: "anchor", id: "email", labelKey: "settings.section.email" },
  { kind: "anchor", id: "custom-integrations", labelKey: "settings.section.customIntegrations" },
  { kind: "anchor", id: "notifications", labelKey: "settings.section.notifications" },
  { kind: "anchor", id: "team", labelKey: "settings.section.team" },
  // Sub-pages — clicking these routes the user away from the
  // single-page scrollable settings view to a dedicated page.
  { kind: "page", href: "talk", labelKey: "settings.section.talk" },
  { kind: "page", href: "subscription", labelKey: "settings.section.subscription" },
  { kind: "anchor", id: "danger", labelKey: "settings.section.danger" },
];

export default async function SettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) redirect("/login");

  const members = await listWorkspaceMembers(workspace.id);
  // Determine if the signed-in user is the owner — Danger zone uses this
  // to show or hide destructive actions. We pull weather coords + the
  // tiered-API-key state + business + nav-nodes on the same trip so the
  // settings page renders in one round trip.
  const supabase = await createSupabaseServerClient();
  const [
    { data: wsExtra },
    apiKeys,
    businesses,
    { data: navRows },
    { data: telegramRows },
    { data: customIntegrationsRows },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "owner_id, weather_city, weather_lat, weather_lon, daily_spend_limit_cents, monthly_spend_limit_cents, auto_pause_on_limit, notify_email, notify_email_on_done, notify_email_on_fail, default_provider, default_model, default_system_prompt, telegram_topology, ollama_host, ollama_port, ollama_models_cached, ollama_last_scan_at",
      )
      .eq("id", workspace.id)
      .maybeSingle(),
    listApiKeys(workspace.id),
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
      .from("custom_integrations")
      .select(
        "id, scope, scope_id, name, url, method, headers, body_template, on_run_done, on_run_fail, on_queue_review, enabled",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
  ]);
  const navNodes = (navRows ?? []) as NavNode[];
  const telegramTargets = (telegramRows ?? []) as TelegramTargetRow[];
  const customIntegrations = (customIntegrationsRows ??
    []) as CustomIntegrationRow[];
  const isOwner = !!wsExtra && wsExtra.owner_id === user.id;
  const weatherInitial = {
    city: wsExtra?.weather_city ?? "Breda",
    lat: Number(wsExtra?.weather_lat ?? 51.589),
    lon: Number(wsExtra?.weather_lon ?? 4.776),
  };

  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("settings.title")}</h1>
        <span className="sub">{t("settings.sub")}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 28 }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SECTIONS.map((s) => (
            <a
              key={s.kind === "anchor" ? `a:${s.id}` : `p:${s.href}`}
              href={s.kind === "anchor" ? `#${s.id}` : s.href}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                color: "var(--app-fg-2)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {t(s.labelKey)}
            </a>
          ))}
        </nav>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <SectionCard id="general" title={t("settings.section.general")}>
            <SettingsRow
              label={t("settings.field.workspaceName")}
              value={workspace.name}
            />
            <SettingsRow
              label={t("settings.field.email")}
              value={user.email ?? "—"}
            />
            <SettingsRow
              label={t("settings.field.timezone")}
              value="Europe/Amsterdam"
            />
            <form action={signOutAction} style={{ marginTop: 14 }}>
              <button
                type="submit"
                style={{
                  padding: "8px 14px",
                  border: "1.5px solid var(--rose)",
                  background: "transparent",
                  color: "var(--rose)",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                {t("common.signOut")}
              </button>
            </form>
          </SectionCard>

          <SectionCard
            id="agent-defaults"
            title={t("settings.section.agentDefaults")}
            desc={t("settings.section.agentDefaults.desc")}
          >
            <WorkspaceDefaultsPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              initial={{
                provider: (wsExtra?.default_provider as string | null) ?? null,
                model: (wsExtra?.default_model as string | null) ?? null,
                system_prompt:
                  (wsExtra?.default_system_prompt as string | null) ?? null,
              }}
            />
          </SectionCard>

          <SectionCard
            id="weather"
            title={t("settings.section.weather")}
            desc={t("settings.section.weather.desc")}
          >
            <WeatherSettings
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              initial={weatherInitial}
            />
          </SectionCard>

          <SectionCard
            id="ollama"
            title={t("settings.section.ollama")}
            desc={t("settings.section.ollama.desc")}
          >
            <OllamaPanel
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              initial={{
                host: (wsExtra?.ollama_host as string | null) ?? null,
                port: (wsExtra?.ollama_port as number | null) ?? null,
                models:
                  (wsExtra?.ollama_models_cached as
                    | { name: string; size: number; modified_at: string }[]
                    | null) ?? [],
                lastScanAt:
                  (wsExtra?.ollama_last_scan_at as string | null) ?? null,
              }}
            />
          </SectionCard>

          <SectionCard
            id="api-keys"
            title={t("settings.section.apiKeys")}
            desc={t("settings.section.apiKeys.desc")}
          >
            <ApiKeysPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              initialKeys={apiKeys}
              businesses={businesses}
              navNodes={navNodes}
            />
          </SectionCard>

          <SectionCard
            id="spend-limits"
            title={t("settings.section.spendLimits")}
            desc={t("settings.section.spendLimits.desc")}
          >
            <SpendLimitsPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              initial={{
                daily_cents:
                  (wsExtra?.daily_spend_limit_cents as number | null) ?? null,
                monthly_cents:
                  (wsExtra?.monthly_spend_limit_cents as number | null) ?? null,
                auto_pause:
                  (wsExtra?.auto_pause_on_limit as boolean | null) ?? true,
              }}
            />
          </SectionCard>

          <SectionCard
            id="telegram"
            title={t("settings.section.telegram")}
            desc={t("settings.section.telegram.desc")}
          >
            <TelegramPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              initialTargets={telegramTargets}
              businesses={businesses}
              navNodes={navNodes}
              initialTopology={
                ((wsExtra?.telegram_topology as
                  | "manual"
                  | "topic_per_business"
                  | "topic_per_business_and_node"
                  | undefined) ?? "manual") as
                  | "manual"
                  | "topic_per_business"
                  | "topic_per_business_and_node"
              }
            />
          </SectionCard>

          <SectionCard
            id="email"
            title={t("settings.section.email")}
            desc={t("settings.section.email.desc")}
          >
            <EmailNotifsPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              initial={{
                email: (wsExtra?.notify_email as string | null) ?? null,
                on_done:
                  (wsExtra?.notify_email_on_done as boolean | null) ?? false,
                on_fail:
                  (wsExtra?.notify_email_on_fail as boolean | null) ?? true,
              }}
              smtpConfigured={await isEmailConfigured(workspace.id)}
            />
          </SectionCard>

          <SectionCard
            id="custom-integrations"
            title={t("settings.section.customIntegrations")}
            desc={t("settings.section.customIntegrations.desc")}
          >
            <CustomIntegrationsPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              initialItems={customIntegrations}
              businesses={businesses}
              navNodes={navNodes}
            />
          </SectionCard>

          <SectionCard
            id="notifications"
            title={t("settings.section.notifications")}
            desc={t("settings.section.notifs.desc")}
          >
            <NotificationsButton />
          </SectionCard>

          <SectionCard
            id="team"
            title={t("settings.section.team")}
            desc={t("settings.section.team.desc")}
          >
            <TeamPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              members={members}
              currentUserId={user.id}
            />
          </SectionCard>

          <SectionCard
            id="danger"
            title={t("settings.section.danger")}
            desc={t("settings.section.danger.desc")}
          >
            <DangerZone
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              isOwner={isOwner}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        padding: "22px 24px",
        scrollMarginTop: 16,
      }}
    >
      <h3
        style={{
          fontFamily: "var(--hand)",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.2px",
          margin: "0 0 4px",
        }}
      >
        {title}
      </h3>
      {desc && (
        <p style={{ color: "var(--app-fg-3)", fontSize: 13, margin: "0 0 16px" }}>
          {desc}
        </p>
      )}
      {children}
    </section>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        alignItems: "center",
        gap: 14,
        padding: "12px 0",
        borderTop: "1px solid var(--app-border-2)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--app-fg-2)" }}>{value}</div>
    </div>
  );
}
