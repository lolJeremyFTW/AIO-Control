// Workspace settings — General + Notifications + Team panels in one
// scrollable page. The section nav on the left is purely decorative for
// phase 7+ (clicking smooth-scrolls to the section anchor).

import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { signOutAction } from "../../(auth)/actions";
import { listApiKeys } from "../../actions/api-keys";
import { ApiKeysPanel } from "../../../components/ApiKeysPanel";
import { EmailNotifsPanel } from "../../../components/EmailNotifsPanel";
import { SpendLimitsPanel } from "../../../components/SpendLimitsPanel";
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

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "weather", label: "Weather" },
  { id: "api-keys", label: "API Keys" },
  { id: "spend-limits", label: "Spend limits" },
  { id: "telegram", label: "Telegram" },
  { id: "email", label: "Email" },
  { id: "custom-integrations", label: "Custom integrations" },
  { id: "notifications", label: "Notifications" },
  { id: "team", label: "Team & roles" },
  { id: "danger", label: "Danger zone" },
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
        "owner_id, weather_city, weather_lat, weather_lon, daily_spend_limit_cents, monthly_spend_limit_cents, auto_pause_on_limit, notify_email, notify_email_on_done, notify_email_on_fail",
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

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Settings</h1>
        <span className="sub">Account · workspace · automations</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 28 }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                color: "var(--app-fg-2)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <SectionCard id="general" title="General">
            <SettingsRow label="Workspace name" value={workspace.name} />
            <SettingsRow label="Email" value={user.email ?? "—"} />
            <SettingsRow label="Tijdzone" value="Europe/Amsterdam" />
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
                Sign out
              </button>
            </form>
          </SectionCard>

          <SectionCard
            id="weather"
            title="Weather chip"
            desc="De rechterbovenhoek van de header toont een weer-chip per workspace."
          >
            <WeatherSettings
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              initial={weatherInitial}
            />
          </SectionCard>

          <SectionCard
            id="api-keys"
            title="API Keys"
            desc="Workspace-defaults of overrides per business of topic. Encryptie via pgcrypto."
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
            title="Spend limits"
            desc="Daag/maand caps per workspace; auto-pause als gewenst."
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
            title="Telegram"
            desc="Stuur run-rapporten naar één of meer Telegram-channels."
          >
            <TelegramPanel
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              initialTargets={telegramTargets}
              businesses={businesses}
              navNodes={navNodes}
            />
          </SectionCard>

          <SectionCard
            id="email"
            title="Email notifications"
            desc="Run-rapporten via SMTP. Per-business / per-agent overrides via right-click."
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
            title="Custom integrations"
            desc="Algemene HTTP webhooks / API calls. Mustache placeholders voor run-data."
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
            title="Notifications"
            desc="Web Push voor HITL-items op dit apparaat."
          >
            <NotificationsButton />
          </SectionCard>

          <SectionCard
            id="team"
            title="Team & roles"
            desc="Wie mag wat. Owner is altijd jij; je kunt admins/editors/viewers toevoegen."
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
            title="Danger zone"
            desc="Data exporteren of de workspace permanent verwijderen."
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
