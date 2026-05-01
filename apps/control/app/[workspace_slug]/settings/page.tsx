// Workspace settings — General + Notifications + Team panels in one
// scrollable page. The section nav on the left is purely decorative for
// phase 7+ (clicking smooth-scrolls to the section anchor).

import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { signOutAction } from "../../(auth)/actions";
import { NotificationsButton } from "../../../components/NotificationsButton";
import { TeamPanel } from "../../../components/TeamPanel";
import { listWorkspaceMembers } from "../../../lib/queries/members";

type Props = { params: Promise<{ workspace_slug: string }> };

const SECTIONS = [
  { id: "general", label: "General" },
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
            desc="Onomkeerbare acties. Komt in fase 8."
          >
            <p style={{ fontSize: 12.5, color: "var(--app-fg-3)" }}>
              Workspace verwijderen / data exporteren — nog niet
              geïmplementeerd.
            </p>
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
