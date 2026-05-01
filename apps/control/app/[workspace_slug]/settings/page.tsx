// Workspace settings landing — phase 2 stub mirroring the design's section
// nav. Forms are wired live in phase 2.5; this commit gives users a real
// page to navigate to so the rail "Settings" item works.

import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { signOutAction } from "../../(auth)/actions";

type Props = { params: Promise<{ workspace_slug: string }> };

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "automations", label: "Automations" },
  { id: "team", label: "Team & roles" },
  { id: "billing", label: "Billing & usage" },
  { id: "security", label: "Security" },
  { id: "integrations", label: "Integrations" },
  { id: "danger", label: "Danger zone" },
];

export default async function SettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) redirect("/login");

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Settings</h1>
        <span className="sub">Account · workspace · automations</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 28 }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                color: i === 0 ? "var(--tt-green)" : "var(--app-fg-2)",
                background:
                  i === 0 ? "rgba(57,178,85,0.10)" : "transparent",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div
          style={{
            background: "var(--app-card)",
            border: "1.5px solid var(--app-border)",
            borderRadius: 16,
            padding: "22px 24px",
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
            General
          </h3>
          <p style={{ color: "var(--app-fg-3)", fontSize: 13, margin: "0 0 16px" }}>
            Basisinfo. Volledige instellingen-UI komt in fase 2.5.
          </p>
          <SettingsRow label="Workspace name" value={workspace.name} />
          <SettingsRow label="Email" value={user.email ?? "—"} />
          <SettingsRow label="Tijdzone" value="Europe/Amsterdam" />

          <form action={signOutAction} style={{ marginTop: 22 }}>
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
        </div>
      </div>
    </div>
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
