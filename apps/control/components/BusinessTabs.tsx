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
import { usePathname } from "next/navigation";

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
  };
};

export function BusinessTabs({
  workspaceSlug,
  businessId,
  routinesCount,
  lastRun,
  topicTabs,
  labels,
}: Props) {
  const path = usePathname() ?? "";
  const base = `/${workspaceSlug}/business/${businessId}`;

  const L = {
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
      // Topics doesn't have its own root — clicking it routes back to
      // the business root where the user can pick a topic from the
      // rail. The tab lights up when the URL is /n/...
      href: base,
      label: L.topics,
      match: (p) => p.startsWith(`${base}/n/`),
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
        return (
          <Link
            key={t.label + t.href}
            href={t.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              borderBottom: active
                ? "2px solid var(--tt-green)"
                : "2px solid transparent",
              color: active ? "var(--app-fg)" : "var(--app-fg-3)",
              transform: "translateY(1px)",
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
        );
      })}

      {/* Right-aligned status pill — renders only when we know
          the last-run state. */}
      {lastRun && (
        <span style={{ marginLeft: "auto" }}>
          <LastRunPill prefix={L.lastRun} at={lastRun.at} status={lastRun.status} />
        </span>
      )}
    </div>
  );
}

function LastRunPill({
  prefix,
  at,
  status,
}: {
  prefix: string;
  at: string;
  status: "queued" | "running" | "done" | "failed" | "review";
}) {
  // Friendly relative time — no external dep. "2m geleden" /
  // "1u geleden" / "3d geleden". Falls back to ISO.
  const rel = (() => {
    try {
      const dt = new Date(at).getTime();
      const diff = Math.max(0, Date.now() - dt);
      const m = Math.round(diff / 60_000);
      if (m < 1) return "net";
      if (m < 60) return `${m}m geleden`;
      const h = Math.round(m / 60);
      if (h < 24) return `${h}u geleden`;
      const d = Math.round(h / 24);
      return `${d}d geleden`;
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
