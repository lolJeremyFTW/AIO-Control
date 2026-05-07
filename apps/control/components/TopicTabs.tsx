"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  /** Base href for the topic, e.g. /ws/business/biz/n/outreach */
  baseHref: string;
  /** Current nav_node name shown as the section label */
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
      {/* Topic name as the left anchor */}
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 800,
          color: "var(--app-fg)",
          padding: "8px 14px",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          transform: "translateY(1px)",
          borderBottom: "2px solid transparent",
        }}
      >
        {topicName}
      </span>

      {SUB_TABS.map(({ label, suffix }) => {
        const href = `${baseHref}${suffix}`;
        const active =
          suffix === ""
            ? path === baseHref || path === `${baseHref}/`
            : path === href || path.startsWith(`${href}/`);
        return (
          <span
            key={label}
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
              href={href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 10px 8px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                color: active ? "var(--app-fg)" : "var(--app-fg-3)",
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          </span>
        );
      })}
    </div>
  );
}
