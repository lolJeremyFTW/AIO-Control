"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  /** Base href for the topic, e.g. /ws/business/biz/n/outreach */
  baseHref: string;
  /** Current nav_node name shown as the "active section" label */
  topicName: string;
};

const SUB_TABS = [
  { label: "Overzicht", suffix: "" },
  { label: "Agents", suffix: "/agents" },
  { label: "Runs", suffix: "/runs" },
] as const;

export function TopicTabs({ baseHref, topicName }: Props) {
  const path = usePathname() ?? "";

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
      {/* Topic label */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--app-fg-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "8px 12px 8px 0",
          marginRight: 4,
          borderRight: "1px solid var(--app-border-2)",
        }}
      >
        {topicName}
      </span>

      {SUB_TABS.map(({ label, suffix }) => {
        const href = `${baseHref}${suffix}`;
        const active = suffix === ""
          ? path === baseHref
          : path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={label}
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              color: active ? "var(--app-fg)" : "var(--app-fg-3)",
              textDecoration: "none",
              borderBottom: active
                ? "2px solid var(--tt-green)"
                : "2px solid transparent",
              transform: "translateY(1px)",
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
