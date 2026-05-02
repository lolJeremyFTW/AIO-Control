// Sub-nav for a single business — sits under the page title and links to
// queue, agents, and (later) integrations + settings tabs.

"use client";

import { usePathname } from "next/navigation";

type Props = {
  workspaceSlug: string;
  businessId: string;
};

export function BusinessTabs({ workspaceSlug, businessId }: Props) {
  const path = usePathname();
  const base = `/${workspaceSlug}/business/${businessId}`;
  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
    { href: base, label: "Wachtrij", match: (p) => p === base },
    { href: `${base}/agents`, label: "Agents", match: (p) => p.startsWith(`${base}/agents`) },
    { href: `${base}/schedules`, label: "Schedules", match: (p) => p.startsWith(`${base}/schedules`) },
    { href: `${base}/runs`, label: "Runs", match: (p) => p.startsWith(`${base}/runs`) },
    { href: `${base}/integrations`, label: "Integrations", match: (p) => p.startsWith(`${base}/integrations`) },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 16,
        borderBottom: "1px solid var(--app-border-2)",
      }}
    >
      {tabs.map((t) => {
        const active = t.match(path);
        return (
          <a
            key={t.href}
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
