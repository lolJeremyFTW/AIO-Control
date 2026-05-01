// Small dropdown that lets the user switch to another workspace they belong
// to. Phase 1 implementation — native <details> for accessibility, no
// external popover lib. We can swap in Radix Menu later if we need keyboard
// nav over more than a handful of workspaces.

"use client";

import { useRouter } from "next/navigation";

import type { WorkspaceListItem } from "../lib/auth/workspace";

type Props = {
  current: { slug: string; name: string };
  workspaces: WorkspaceListItem[];
};

export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const router = useRouter();

  if (workspaces.length <= 1) {
    // Hide the switcher entirely when there's nothing to switch to. The
    // crumb in the header already shows the workspace name.
    return null;
  }

  return (
    <details
      style={{
        display: "inline-block",
        position: "relative",
        marginBottom: 12,
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 999,
          border: "1.5px solid var(--app-border)",
          background: "var(--app-card-2)",
          color: "var(--app-fg-2)",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Workspace · {current.name}
        <span style={{ opacity: 0.7, fontSize: 11 }}>▾</span>
      </summary>
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          background: "var(--app-card)",
          border: "1.5px solid var(--app-border)",
          borderRadius: 12,
          padding: 6,
          minWidth: 220,
          boxShadow: "0 16px 40px -10px rgba(0,0,0,0.45)",
          zIndex: 20,
        }}
      >
        {workspaces.map((w) => (
          <button
            key={w.id}
            onClick={() => router.push(`/${w.slug}/dashboard`)}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background:
                w.slug === current.slug
                  ? "rgba(57,178,85,0.10)"
                  : "transparent",
              color:
                w.slug === current.slug
                  ? "var(--tt-green)"
                  : "var(--app-fg)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span>{w.name}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--app-fg-3)",
              }}
            >
              {w.role}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}
