"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type CustomTab = { id: string; label: string; url: string };

type Props = {
  /** Base href for the topic, e.g. /ws/business/biz/n/outreach */
  baseHref: string;
  /** Current nav_node name shown as the section label */
  topicName: string;
  /** UUID of the nav_node — used to load and create custom tabs */
  navNodeId: string;
  workspaceId: string;
};

const BUILT_IN_TABS = [
  { label: "Overzicht", suffix: "" },
  { label: "Agents", suffix: "/agents" },
  { label: "Runs", suffix: "/runs" },
] as const;

export function TopicTabs({ baseHref, topicName, navNodeId, workspaceId }: Props) {
  const path = usePathname() ?? "";

  const [customTabs, setCustomTabs] = useState<CustomTab[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refreshTabs = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      const res = await fetch(
        `${base}/api/custom-tabs?nav_node_id=${navNodeId}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) return;
      const { tabs } = (await res.json()) as { tabs: CustomTab[] };
      setCustomTabs(tabs);
    } catch {
      // silently fail
    }
  }, [navNodeId]);

  useEffect(() => {
    void refreshTabs();
  }, [refreshTabs]);

  // Refresh on tab visibility change and every 15s for agent-created tabs.
  useEffect(() => {
    function onVisible() {
      if (!document.hidden) void refreshTabs();
    }
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(() => void refreshTabs(), 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [refreshTabs]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addLabel.trim() || !addUrl.trim()) return;
    setAdding(true);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const res = await fetch(`${base}/api/custom-tabs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        workspace_id: workspaceId,
        nav_node_id: navNodeId,
        label: addLabel.trim(),
        url: addUrl.trim(),
      }),
    });
    setAdding(false);
    if (res.ok) {
      setShowAdd(false);
      setAddLabel("");
      setAddUrl("");
      await refreshTabs();
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    await fetch(`${base}/api/custom-tabs/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setDeleting(null);
    await refreshTabs();
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 0,
          borderBottom: "1px solid var(--app-border-2)",
          flexWrap: "wrap",
        }}
      >
        {/* Topic name as left anchor */}
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

        {BUILT_IN_TABS.map(({ label, suffix }) => {
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

        {customTabs.map((tab) => {
          const href = `${baseHref}/dashboard/${tab.id}`;
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <span
              key={tab.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                transform: "translateY(1px)",
                borderBottom: active
                  ? "2px solid var(--tt-green)"
                  : "2px solid transparent",
              }}
            >
              <a
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
                {tab.label}
              </a>
              <button
                type="button"
                onClick={() => handleDelete(tab.id)}
                disabled={deleting === tab.id}
                title="Verwijder tab"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 6px 0 0",
                  color: "var(--app-fg-3)",
                  fontSize: 11,
                  lineHeight: 1,
                  opacity: deleting === tab.id ? 0.4 : 0.6,
                }}
              >
                ×
              </button>
            </span>
          );
        })}

        {/* + button */}
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
      </div>

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
            onSubmit={handleAdd}
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
              Dashboard tab toevoegen
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
              placeholder="URL (bijv. https://...)"
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
