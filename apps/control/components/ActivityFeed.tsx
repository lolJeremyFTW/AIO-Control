// Renders the audit_log rows as a chronological feed. Filter pills for
// resource_table at the top so the user can look at "just business
// changes" or "just schedule changes". Page-size of 50 — pagination is
// nice-to-have but not in this slice.

"use client";

import Link from "next/link";

type AuditRow = {
  id: string;
  action: "INSERT" | "UPDATE" | "DELETE" | string;
  resource_table: string;
  resource_id: string | null;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
};

type Props = {
  workspaceSlug: string;
  items: AuditRow[];
  actorName: Record<string, string>;
  activeTable: string | null;
};

const TABLES = [
  { id: null, label: "Alles" },
  { id: "businesses", label: "Businesses" },
  { id: "agents", label: "Agents" },
  { id: "schedules", label: "Schedules" },
  { id: "workspace_members", label: "Team" },
  { id: "integrations", label: "Integrations" },
];

const ACTION_LABEL: Record<string, string> = {
  INSERT: "aangemaakt",
  UPDATE: "bewerkt",
  DELETE: "verwijderd",
};

const ACTION_COLOR: Record<string, string> = {
  INSERT: "var(--tt-green)",
  UPDATE: "var(--amber)",
  DELETE: "var(--rose)",
};

export function ActivityFeed({
  workspaceSlug,
  items,
  actorName,
  activeTable,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABLES.map((t) => {
          const active = activeTable === t.id || (!activeTable && t.id === null);
          const href = t.id
            ? `/${workspaceSlug}/activity?table=${t.id}`
            : `/${workspaceSlug}/activity`;
          return (
            <Link
              key={t.id ?? "all"}
              href={href}
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 700,
                border: `1.5px solid ${
                  active ? "var(--tt-green)" : "var(--app-border)"
                }`,
                background: active
                  ? "rgba(57,178,85,0.10)"
                  : "transparent",
                color: active ? "var(--tt-green)" : "var(--app-fg-2)",
                textDecoration: "none",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13,
            padding: 16,
            border: "1.5px dashed var(--app-border)",
            borderRadius: 12,
          }}
        >
          Geen activity.
        </p>
      ) : (
        <div
          style={{
            border: "1px solid var(--app-border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {items.map((item) => {
            const actor = item.actor_id
              ? (actorName[item.actor_id] ?? "(onbekende user)")
              : "(systeem)";
            const action = ACTION_LABEL[item.action] ?? item.action;
            const color = ACTION_COLOR[item.action] ?? "var(--app-fg-3)";
            const summary = summarize(item);
            return (
              <div
                key={item.id}
                style={{
                  padding: "10px 14px",
                  background: "var(--app-card)",
                  borderBottom: "1px solid var(--app-border-2)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: color,
                    marginTop: 8,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{actor}</strong>{" "}
                    <span style={{ color: "var(--app-fg-3)" }}>{action}</span>{" "}
                    <span style={{ color: "var(--app-fg-2)" }}>
                      {item.resource_table}
                    </span>
                    {summary && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: "var(--app-fg-3)",
                          fontSize: 12,
                        }}
                      >
                        — {summary}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--app-fg-3)",
                      marginTop: 2,
                    }}
                  >
                    {new Date(item.created_at).toLocaleString("nl-NL")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Try to extract the human name of the resource from the audit
// payload — most rows include the new column values (or old values
// for delete) so we can show "Faceless YouTube" instead of a UUID.
function summarize(item: AuditRow): string | null {
  const p = item.payload as
    | { new?: Record<string, unknown>; old?: Record<string, unknown> }
    | null;
  const row = (p?.new ?? p?.old) as Record<string, unknown> | undefined;
  if (!row) return null;
  if (typeof row.name === "string") return row.name;
  if (typeof row.title === "string") return row.title;
  if (typeof row.label === "string") return row.label;
  return null;
}
