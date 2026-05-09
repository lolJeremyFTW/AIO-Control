import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import {
  getAdminUsersActivity,
  type AdminUserActivity,
} from "../../../../lib/admin/users";
import { getDict } from "../../../../lib/i18n/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function AdminUsersPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [workspace, activity, { t }] = await Promise.all([
    getWorkspaceBySlug(workspace_slug),
    getAdminUsersActivity(user.id),
    getDict(),
  ]);

  if (!workspace) notFound();
  if (!activity.authorized) notFound();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.adminUsers")}</h1>
        <span className="sub">{t("page.adminUsers.sub")}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <Metric label="Users" value={activity.totals.users} />
        <Metric label="Global admins" value={activity.totals.admins} />
        <Metric label="Workspaces" value={activity.totals.workspaces} />
        <Metric label="Logins 30d" value={activity.totals.logins_30d} />
        <Metric label="Audit events 30d" value={activity.totals.audits_30d} />
        <Metric label="Run starts 30d" value={activity.totals.run_starts_30d} />
      </div>

      <section className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "User",
                  "Role",
                  "Workspaces",
                  "Last login",
                  "Logins 30d",
                  "Audit 30d",
                  "Run starts 30d",
                ].map((heading) => (
                  <th key={heading} style={th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={td}>
                    No users found.
                  </td>
                </tr>
              ) : (
                activity.users.map((row) => <UserRow key={row.id} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UserRow({ row }: { row: AdminUserActivity }) {
  return (
    <tr>
      <td style={td}>
        <strong>{row.display_name}</strong>
        <div style={muted}>{row.email || row.id}</div>
        <div style={muted}>Joined {formatDate(row.created_at)}</div>
      </td>
      <td style={td}>
        <span style={pill(row.is_admin ? "good" : "muted")}>
          {row.is_admin ? "global admin" : "user"}
        </span>
      </td>
      <td style={td}>
        {row.workspaces.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {row.workspaces.map((workspace) => (
              <span key={workspace.id} style={workspacePill}>
                {workspace.name} ({workspace.role})
              </span>
            ))}
          </div>
        ) : (
          "-"
        )}
      </td>
      <td style={td}>
        {row.last_login ? (
          <>
            {formatDate(row.last_login.created_at)}
            <div style={muted}>
              {row.last_login.device_label ?? "Unknown device"}
              {row.last_login.ip_address
                ? ` - ${row.last_login.ip_address}`
                : ""}
            </div>
            <div style={muted}>{row.last_login.method}</div>
          </>
        ) : (
          "-"
        )}
      </td>
      <td style={tdNumeric}>{row.login_count_30d}</td>
      <td style={tdNumeric}>{row.audit_count_30d}</td>
      <td style={tdNumeric}>{row.run_start_count_30d}</td>
    </tr>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 850 }}>{value}</div>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("nl-NL");
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  color: "var(--app-fg-3)",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--app-border-2)",
};

const td: React.CSSProperties = {
  padding: "11px 12px",
  fontSize: 12.5,
  borderBottom: "1px solid var(--app-border-2)",
  verticalAlign: "top",
};

const tdNumeric: React.CSSProperties = {
  ...td,
  fontFamily: "ui-monospace, Menlo, monospace",
  fontVariantNumeric: "tabular-nums",
};

const muted: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 11.5,
};

const pill = (tone: "good" | "muted"): React.CSSProperties => ({
  display: "inline-flex",
  border: "1px solid var(--app-border-2)",
  borderRadius: 999,
  padding: "2px 7px",
  color: tone === "good" ? "var(--tt-green)" : "var(--app-fg-3)",
  fontSize: 11,
  fontWeight: 800,
});

const workspacePill: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  padding: "3px 7px",
  color: "var(--app-fg-2)",
  fontSize: 11,
  fontWeight: 700,
};
