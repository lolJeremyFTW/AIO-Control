// Renders the audit_log rows as a chronological feed. Filter pills for
// resource_table at the top so the user can look at "just business
// changes" or "just schedule changes". Page-size of 50 — pagination is
// nice-to-have but not in this slice.

"use client";

import Link from "next/link";
import { useState } from "react";

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
          {items.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              actorName={actorName}
            />
          ))}
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

function ActivityRow({
  item,
  actorName,
}: {
  item: AuditRow;
  actorName: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const actor = item.actor_id
    ? (actorName[item.actor_id] ?? "(onbekende user)")
    : "(systeem)";
  const action = ACTION_LABEL[item.action] ?? item.action;
  const color = ACTION_COLOR[item.action] ?? "var(--app-fg-3)";
  const summary = summarize(item);
  const detail = formatDetail(item);
  const tableLabel =
    TABLE_LABELS[item.resource_table] ?? item.resource_table;
  const hasDetail = detail.length > 0;

  return (
    <div
      role={hasDetail ? "button" : undefined}
      tabIndex={hasDetail ? 0 : undefined}
      onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
      onKeyDown={
        hasDetail
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setExpanded((v) => !v);
              }
            }
          : undefined
      }
      style={{
        padding: "10px 14px",
        background: "var(--app-card)",
        borderBottom: "1px solid var(--app-border-2)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: hasDetail ? "pointer" : "default",
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>
          <strong>{actor}</strong>{" "}
          <span style={{ color: "var(--app-fg-3)" }}>{action}</span>{" "}
          <span style={{ color: "var(--app-fg-2)" }}>{tableLabel}</span>
          {summary && (
            <span
              style={{
                marginLeft: 6,
                color: "var(--app-fg)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              · {summary}
            </span>
          )}
          {hasDetail && (
            <span
              aria-hidden
              style={{
                marginLeft: 8,
                color: "var(--app-fg-3)",
                fontSize: 10.5,
              }}
            >
              {expanded ? "▾" : "▸"}
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
          {item.resource_id && (
            <span style={{ marginLeft: 8, fontFamily: "ui-monospace, Menlo, monospace" }}>
              id: {item.resource_id.slice(0, 8)}
            </span>
          )}
        </div>
        {expanded && hasDetail && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              background: "var(--app-card-2)",
              border: "1px solid var(--app-border-2)",
              borderRadius: 8,
              fontSize: 11.5,
              fontFamily: "ui-monospace, Menlo, monospace",
              lineHeight: 1.5,
              color: "var(--app-fg-2)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 320,
              overflow: "auto",
            }}
          >
            {detail.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TABLE_LABELS: Record<string, string> = {
  businesses: "business",
  agents: "agent",
  schedules: "schedule",
  workspace_members: "team-lid",
  nav_nodes: "topic",
  telegram_targets: "telegram-target",
  api_keys: "API key",
  custom_integrations: "custom integration",
  runs: "run",
};

// Diff-friendly formatter. INSERT/DELETE: show the relevant fields
// of the row. UPDATE: show only the fields that actually changed,
// `old → new`. Skips noisy columns (timestamps, encrypted blobs).
function formatDetail(item: AuditRow): string[] {
  const p = item.payload as
    | { new?: Record<string, unknown>; old?: Record<string, unknown> }
    | null;
  if (!p) return [];
  const SKIP = new Set([
    "id",
    "workspace_id",
    "business_id",
    "agent_id",
    "schedule_id",
    "user_id",
    "actor_id",
    "created_at",
    "updated_at",
    "encrypted_value",
    "webhook_secret_hash",
    "provider_bearer_token",
  ]);
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 140) return JSON.stringify(t.slice(0, 140) + "…");
      return JSON.stringify(t);
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
      const s = JSON.stringify(v);
      return s.length > 200 ? s.slice(0, 200) + "…" : s;
    } catch {
      return String(v);
    }
  };

  if (item.action === "UPDATE") {
    const oldRow = (p.old ?? {}) as Record<string, unknown>;
    const newRow = (p.new ?? {}) as Record<string, unknown>;
    const lines: string[] = [];
    const keys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
    for (const k of keys) {
      if (SKIP.has(k)) continue;
      const a = oldRow[k];
      const b = newRow[k];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      lines.push(`${k}: ${fmt(a)} → ${fmt(b)}`);
    }
    return lines;
  }

  const row = (item.action === "DELETE" ? p.old : p.new) as
    | Record<string, unknown>
    | undefined;
  if (!row) return [];
  const lines: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (SKIP.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    lines.push(`${k}: ${fmt(v)}`);
  }
  return lines;
}
