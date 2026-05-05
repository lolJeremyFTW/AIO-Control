// Sub-nav for a single business. Now context-aware:
//   • At a business root URL → standard CRUD tabs.
//   • At a topic / module drill-in (`/n/<...>`) → optionally swap in
//     topic-specific tabs (the topic itself can declare extra
//     dashboards / mini-apps that show up here).
//
// Layout:
//   [Overzicht] [Agents] [Routines · 4] [Runs] [Integrations] [Topics]   ··· · 2m geleden ✓
//
// • "Routines" is the renamed Schedules tab and shows the active
//   count as a small badge on the right of its label.
// • The right-aligned status pill shows the most recent run's
//   timestamp + an outcome dot (green = done, red = failed, amber
//   = running). Hidden when there are no runs.

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  ChartIcon,
  GridIcon,
  InboxIcon,
  ListIcon,
  RobotIcon,
  ToolsIcon,
} from "@aio/ui/icon";

type Tab = {
  /** Where clicking this tab routes to. */
  href: string;
  /** Visible label. Already translated by the server-rendered
   *  parent — BusinessTabs is a client comp so it doesn't have
   *  access to `t()` for these built-ins. Pass them in. */
  label: string;
  /** Right-aligned count badge (routines / unread items / etc.). */
  badge?: number;
  /** Match function for "is this tab active?". */
  match: (p: string) => boolean;
};

export type BusinessTabsTopicEntry = {
  /** Path appended to the business root, e.g. "/n/<id>/dashboard". */
  href: string;
  /** Already-translated label. */
  label: string;
  /** Custom tab ID — present for user-added iframe tabs, absent for built-in topic entries. */
  id?: string;
  /** Optional icon name from the AppIcon registry. */
  icon?:
    | "video"
    | "chart"
    | "tools"
    | "robot"
    | "list"
    | "inbox"
    | "grid";
};

type Props = {
  workspaceSlug: string;
  businessId: string;
  workspaceId: string;
  /** Number of enabled cron + webhook routines for the business —
   *  rendered as a badge on the "Routines" tab. */
  routinesCount?: number;
  /** Most recent run timestamp + status. Renders the right-aligned
   *  status pill. Pass `null` (or omit) to hide. */
  lastRun?: {
    /** ISO timestamp the run finished. */
    at: string;
    status: "queued" | "running" | "done" | "failed" | "review";
  } | null;
  /** Optional context-specific tabs that show up when the user is
   *  drilled into a topic. The topic-edit dialog (later) lets the
   *  user add custom dashboard tabs that flow through here. Each
   *  entry's href is RELATIVE to the business root. */
  topicTabs?: BusinessTabsTopicEntry[];
  /** Already-translated tab labels for the built-ins. NL fallback
   *  shown when omitted. */
  labels?: {
    overview?: string;
    agents?: string;
    routines?: string;
    runs?: string;
    integrations?: string;
    topics?: string;
    /** Right-aligned status pill prefix, e.g. "Laatste run". */
    lastRun?: string;
    /** Relative-time templates with {n} placeholder. Used by the
     *  status pill so "1m geleden" / "1m ago" / "vor 1m" follow the
     *  user's locale. relNow has no placeholder. */
    relNow?: string;
    relMin?: string;
    relHr?: string;
    relDay?: string;
  };
};

export function BusinessTabs({
  workspaceSlug,
  businessId,
  workspaceId,
  routinesCount,
  lastRun,
  topicTabs,
  labels,
}: Props) {
  const path = usePathname() ?? "";
  const router = useRouter();
  const base = `/${workspaceSlug}/business/${businessId}`;

  const [showAdd, setShowAdd] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleAddTab(e: React.FormEvent) {
    e.preventDefault();
    if (!addLabel.trim() || !addUrl.trim()) return;
    setAdding(true);
    const base64 = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    await fetch(`${base64}/api/custom-tabs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        business_id: businessId,
        workspace_id: workspaceId,
        label: addLabel.trim(),
        url: addUrl.trim(),
      }),
    });
    setAdding(false);
    setShowAdd(false);
    setAddLabel("");
    setAddUrl("");
    router.refresh();
  }

  async function handleDeleteTab(id: string) {
    setDeleting(id);
    const base64 = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    await fetch(`${base64}/api/custom-tabs/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setDeleting(null);
    router.refresh();
  }

  const L = {
    relNow: labels?.relNow ?? "net",
    relMin: labels?.relMin ?? "{n}m geleden",
    relHr: labels?.relHr ?? "{n}u geleden",
    relDay: labels?.relDay ?? "{n}d geleden",
    overview: labels?.overview ?? "Overzicht",
    agents: labels?.agents ?? "Agents",
    routines: labels?.routines ?? "Routines",
    runs: labels?.runs ?? "Runs",
    integrations: labels?.integrations ?? "Integrations",
    topics: labels?.topics ?? "Topics",
    lastRun: labels?.lastRun ?? "Laatste run",
  };

  // Built-in tabs always visible. Order matches the user's spec:
  // Overzicht, Agents, Runs, Integrations, Topics, Routines (last,
  // with count). The "Routines" tab is the old "Schedules" page.
  const builtins: Tab[] = [
    {
      href: base,
      label: L.overview,
      match: (p) =>
        p === base || p === `${base}/queue` || p === `${base}/overview`,
    },
    {
      href: `${base}/agents`,
      label: L.agents,
      match: (p) => p.startsWith(`${base}/agents`),
    },
    {
      href: `${base}/runs`,
      label: L.runs,
      match: (p) => p.startsWith(`${base}/runs`),
    },
    {
      href: `${base}/integrations`,
      label: L.integrations,
      match: (p) => p.startsWith(`${base}/integrations`),
    },
    {
      // Topics opens a flat list of every nav_node in this business
      // (./topics) so the user can find a topic without first locating
      // it in the rail. The tab also lights up when the URL is /n/…
      // (drilled into a specific topic).
      href: `${base}/topics`,
      label: L.topics,
      match: (p) =>
        p.startsWith(`${base}/topics`) || p.startsWith(`${base}/n/`),
    },
    {
      href: `${base}/schedules`,
      label: L.routines,
      badge: routinesCount,
      match: (p) => p.startsWith(`${base}/schedules`),
    },
  ];

  // Topic-specific tabs (custom dashboards added by the user). These
  // come AFTER the built-ins so the standard nav stays anchored on
  // the left.
  const tabs: Tab[] = [
    ...builtins,
    ...(topicTabs ?? []).map((t) => {
      const href = `${base}${t.href}`;
      return {
        href,
        label: t.label,
        match: (p) => p === href || p.startsWith(`${href}/`),
      } satisfies Tab;
    }),
  ];


  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 16,
          borderBottom: "1px solid var(--app-border-2)",
          flexWrap: "wrap",
        }}
      >
        {tabs.map((t) => {
          const active = t.match(path);
          // Find matching topicTab entry to get its id for delete button.
          const topicEntry = (topicTabs ?? []).find(
            (tt) => `${base}${tt.href}` === t.href && tt.id,
          );
          return (
            <span
              key={t.label + t.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                transform: "translateY(1px)",
                borderBottom: active
                  ? "2px solid var(--tt-green)"
                  : "2px solid transparent",
              }}
            >
              <Link
                href={t.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 10px 8px 14px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: active ? "var(--app-fg)" : "var(--app-fg-3)",
                  textDecoration: "none",
                }}
              >
                {t.label}
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.4,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: active
                        ? "var(--tt-green)"
                        : "var(--app-card-2)",
                      color: active ? "#fff" : "var(--app-fg-2)",
                      border: active
                        ? "1px solid var(--tt-green)"
                        : "1px solid var(--app-border)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {t.badge}
                  </span>
                )}
              </Link>
              {topicEntry?.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteTab(topicEntry.id!)}
                  disabled={deleting === topicEntry.id}
                  title="Verwijder tab"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "0 6px 0 0",
                    color: "var(--app-fg-3)",
                    fontSize: 11,
                    lineHeight: 1,
                    opacity: deleting === topicEntry.id ? 0.4 : 0.6,
                  }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}

        {/* "+" button to add a custom iframe tab */}
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          title="Tab toevoegen"
          style={{
            background: "transparent",
            border: "1px dashed var(--app-border)",
            color: "var(--app-fg-3)",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 2,
            transform: "translateY(-1px)",
          }}
        >
          +
        </button>

        {/* Right-aligned status pill — renders only when we know
            the last-run state. */}
        {lastRun && (
          <span style={{ marginLeft: "auto" }}>
            <LastRunPill
              prefix={L.lastRun}
              at={lastRun.at}
              status={lastRun.status}
              relTemplates={{
                now: L.relNow,
                min: L.relMin,
                hr: L.relHr,
                day: L.relDay,
              }}
            />
          </span>
        )}
      </div>

      {/* Add-tab modal */}
      {showAdd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}
        >
          <form
            onSubmit={handleAddTab}
            style={{
              background: "var(--app-card)",
              border: "1px solid var(--app-border)",
              borderRadius: 12,
              padding: 24,
              width: 360,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>
              Tab toevoegen
            </p>
            <input
              autoFocus
              placeholder="Naam (bijv. Outreach dashboard)"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              required
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--app-border)",
                background: "var(--app-card-2)",
                color: "var(--app-fg)",
                fontSize: 13,
              }}
            />
            <input
              placeholder="URL (bijv. https://tromptech.life/srv/outreach-dashboard)"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              required
              type="url"
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--app-border)",
                background: "var(--app-card-2)",
                color: "var(--app-fg)",
                fontSize: 13,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--app-border)",
                  background: "transparent",
                  color: "var(--app-fg-2)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Annuleer
              </button>
              <button
                type="submit"
                disabled={adding}
                style={{
                  padding: "7px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--tt-green)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: adding ? "not-allowed" : "pointer",
                  opacity: adding ? 0.7 : 1,
                }}
              >
                {adding ? "Toevoegen…" : "Toevoegen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function LastRunPill({
  prefix,
  at,
  status,
  relTemplates,
}: {
  prefix: string;
  at: string;
  status: "queued" | "running" | "done" | "failed" | "review";
  relTemplates: { now: string; min: string; hr: string; day: string };
}) {
  // Friendly relative time. Templates are passed in pre-translated so
  // the pill follows the user's UI locale (NL/EN/DE) instead of being
  // hardcoded Dutch. Each template has a {n} placeholder for the count;
  // `now` is a literal.
  const rel = (() => {
    try {
      const dt = new Date(at).getTime();
      const diff = Math.max(0, Date.now() - dt);
      const m = Math.round(diff / 60_000);
      if (m < 1) return relTemplates.now;
      if (m < 60) return relTemplates.min.replace("{n}", String(m));
      const h = Math.round(m / 60);
      if (h < 24) return relTemplates.hr.replace("{n}", String(h));
      const d = Math.round(h / 24);
      return relTemplates.day.replace("{n}", String(d));
    } catch {
      return at;
    }
  })();
  const dotColor =
    status === "done"
      ? "var(--tt-green)"
      : status === "failed"
        ? "var(--rose)"
        : status === "running"
          ? "var(--amber)"
          : "var(--app-fg-3)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--app-fg-3)",
        background: "var(--app-card-2)",
        border: "1px solid var(--app-border-2)",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
      title={`${prefix}: ${at} · ${status}`}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: dotColor,
          boxShadow:
            status === "done"
              ? "0 0 0 2px rgba(57,178,85,0.18)"
              : status === "running"
                ? "0 0 0 2px rgba(255,184,0,0.18)"
                : status === "failed"
                  ? "0 0 0 2px rgba(230,82,107,0.18)"
                  : "none",
        }}
      />
      {prefix} · {rel}
    </span>
  );
}

// Avoid unused-import warnings when icons aren't yet wired.
void ChartIcon;
void GridIcon;
void InboxIcon;
void ListIcon;
void RobotIcon;
void ToolsIcon;
