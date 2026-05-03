// Sub-nav for a single business — sits under the page title and links
// to the business's CRUD-pages (Overzicht, Agents, Schedules, Runs,
// Integrations). Also shows a "Topics" pseudo-tab that lights up when
// the user is drilled into a nav-node tree under this business
// (`/business/<id>/n/...`).

"use client";

import { usePathname } from "next/navigation";

type Props = {
  workspaceSlug: string;
  businessId: string;
};

export function BusinessTabs({ workspaceSlug, businessId }: Props) {
  const path = usePathname() ?? "";
  const base = `/${workspaceSlug}/business/${businessId}`;

  type Tab = {
    href: string;
    label: string;
    match: (p: string) => boolean;
  };
  const tabs: Tab[] = [
    {
      href: base,
      label: "Overzicht",
      // The root URL OR an explicit /overview/queue/etc. tab name. We
      // do NOT match /n/... here — that's the dedicated Topics tab.
      match: (p) =>
        p === base ||
        p === `${base}/queue` ||
        p === `${base}/overview`,
    },
    {
      href: `${base}/agents`,
      label: "Agents",
      match: (p) => p.startsWith(`${base}/agents`),
    },
    {
      href: `${base}/schedules`,
      label: "Schedules",
      match: (p) => p.startsWith(`${base}/schedules`),
    },
    {
      href: `${base}/runs`,
      label: "Runs",
      match: (p) => p.startsWith(`${base}/runs`),
    },
    {
      href: `${base}/integrations`,
      label: "Integrations",
      match: (p) => p.startsWith(`${base}/integrations`),
    },
    {
      // Topics doesn't have its own root — clicking it routes back to
      // the business root where the user can pick a topic from the
      // rail. The tab lights up when the URL is /n/...
      href: base,
      label: "Topics",
      match: (p) => p.startsWith(`${base}/n/`),
    },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 16,
        borderBottom: "1px solid var(--app-border-2)",
        flexWrap: "wrap",
      }}
    >
      {tabs.map((t) => {
        const active = t.match(path);
        return (
          <a
            key={t.label}
            href={t.href}
            style={{
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              borderBottom: active
                ? "2px solid var(--tt-green)"
                : "2px solid transparent",
              color: active ? "var(--app-fg)" : "var(--app-fg-3)",
              transform: "translateY(1px)",
            }}
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}
