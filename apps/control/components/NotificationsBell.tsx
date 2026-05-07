// Header bell + popover. Pulls open queue items + recent failed runs
// from /api/notifications and shows them as a clickable list. Auto-refreshes
// via Supabase Realtime postgres_changes the moment a row lands.

"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BellIcon, ChevronRightIcon, getAppIcon } from "@aio/ui/icon";

import { translate } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Notif = {
  kind: "queue" | "run";
  id: string;
  title: string;
  sub: string;
  state: "review" | "fail" | "failed";
  business_id: string | null;
  nav_node_id: string | null;
  created_at: string;
};

type BusinessLookup = {
  id: string;
  slug: string;
  name: string;
  /** First letter for the avatar dot when no icon is set. */
  letter: string;
  variant: string;
  icon?: string | null;
  logo_url?: string | null;
  /** Optional custom hex (overrides variant). */
  color_hex?: string | null;
};

function isPlainLeftClick(e: ReactMouseEvent<HTMLElement>) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
}

const NODE_VARIANT_COLORS: Record<string, string> = {
  brand: "var(--tt-green)",
  orange: "var(--orange)",
  indigo: "#5b6cff",
  blue: "#2f8fce",
  violet: "#8a4dd6",
  rose: "var(--rose)",
  amber: "var(--amber)",
  teal: "#14b8a6",
  lime: "#84cc16",
  magenta: "#d946ef",
  sky: "#38bdf8",
  coral: "#fb7185",
  slate: "#475569",
  gold: "#ca8a04",
};

function businessColor(biz: BusinessLookup | null) {
  if (!biz) return "var(--app-fg-3)";
  return biz.color_hex ?? NODE_VARIANT_COLORS[biz.variant] ?? "var(--tt-green)";
}

function businessTextColor(biz: BusinessLookup | null) {
  if (!biz) return "#fff";
  if (biz.color_hex) return readableTextColor(biz.color_hex);
  return biz.variant === "amber" ? "#1a1c1a" : "#fff";
}

function readableTextColor(hex: string): string {
  const m = hex.replace("#", "").trim();
  const expanded =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#fff";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 180 ? "#1a1c1a" : "#fff";
}

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  /** Workspace businesses, used to render a per-business header. */
  businesses?: BusinessLookup[];
  navNodes?: Array<{
    id: string;
    business_id: string;
    parent_id: string | null;
    slug: string;
  }>;
  /** Called whenever the items list changes so the caller can sync rail badges. */
  onItemsChange?: (
    items: Array<{ business_id: string | null; nav_node_id: string | null }>,
  ) => void;
};

export function NotificationsBell({
  workspaceSlug,
  workspaceId,
  businesses = [],
  navNodes = [],
  onItemsChange,
}: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const dateLocale =
    locale === "en" ? "en-US" : locale === "de" ? "de-DE" : "nl-NL";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const ref = useRef<HTMLDivElement>(null);
  // Two-step confirm for bulk dismiss so a misclick does not wipe the list.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseStorageKey = `aio:notifs:collapsed:${workspaceId}`;

  const groupedItems = useMemo(() => {
    const groups = new Map<string, Notif[]>();
    for (const n of items) {
      const key = n.business_id ?? "_global";
      const arr = groups.get(key) ?? [];
      arr.push(n);
      groups.set(key, arr);
    }

    const order = ["_global", ...businesses.map((b) => b.id)];
    const known = new Set(order);
    return [
      ...order.filter((id) => groups.has(id)),
      ...Array.from(groups.keys()).filter((id) => !known.has(id)),
    ].map((id) => ({
      id,
      items: groups.get(id)!,
      business:
        id === "_global" ? null : (businesses.find((b) => b.id === id) ?? null),
    }));
  }, [businesses, items]);

  const refresh = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const params = new URLSearchParams({ workspace: workspaceId, locale });
    const res = await fetch(
      `${base}/api/notifications?${params.toString()}`,
    ).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { items: Notif[] };
      setItems(data.items);
    }
  }, [locale, workspaceId]);

  const persistCollapsedGroups = (next: Set<string>) => {
    try {
      window.localStorage.setItem(
        collapseStorageKey,
        JSON.stringify(Array.from(next)),
      );
    } catch {
      // Non-critical browser preference; the popover still works.
    }
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      persistCollapsedGroups(next);
      return next;
    });
  };

  // Mark a notification as dismissed for the current user. Notifications
  // are synthesized from queue_items + failed runs; dismissal is per-user.
  const dismiss = (kind: "queue" | "run", id: string) => {
    setItems((prev) => prev.filter((n) => !(n.kind === kind && n.id === id)));
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    void fetch(`${base}/api/notifications/dismiss`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ kind, id }),
    }).catch(() => {
      // On failure the next refresh() will repopulate it.
    });
  };

  const dismissAll = () => {
    const snapshot = items;
    setItems([]);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    for (const n of snapshot) {
      void fetch(`${base}/api/notifications/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ kind: n.kind, id: n.id }),
      }).catch(() => {});
    }
  };

  const armOrClearAll = () => {
    if (confirmingClear) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
      setConfirmingClear(false);
      dismissAll();
      return;
    }
    setConfirmingClear(true);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingClear(false);
      confirmTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => {
    if (!open) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
      setConfirmingClear(false);
    }
  }, [open]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(collapseStorageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        setCollapsedGroups(
          new Set(parsed.filter((value) => typeof value === "string")),
        );
      }
    } catch {
      setCollapsedGroups(new Set());
    }
  }, [collapseStorageKey]);

  useEffect(() => {
    onItemsChange?.(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    const ch = supabase
      .channel(`notifs:${workspaceId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "aio_control",
          table: "queue_items",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => void refresh(),
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "aio_control",
          table: "runs",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [workspaceId, refresh]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const onDoc = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const count = items.length;
  const routeForNotification = (n: Notif) => {
    if (!n.business_id) return `/${workspaceSlug}/queue`;

    const biz = businesses.find((b) => b.id === n.business_id);
    const businessPath = `/${workspaceSlug}/business/${biz?.slug ?? n.business_id}`;
    if (!n.nav_node_id) {
      return `${businessPath}${n.kind === "run" ? "/runs" : ""}`;
    }

    const byId = new Map(navNodes.map((node) => [node.id, node]));
    const chain: string[] = [];
    let current = byId.get(n.nav_node_id);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift(current.slug);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }

    if (chain.length === 0) {
      return `${businessPath}${n.kind === "run" ? "/runs" : ""}`;
    }
    return `${businessPath}/n/${chain.join("/")}${n.kind === "run" ? "/runs" : ""}`;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="ibtn"
        aria-label={t("notifications.aria")}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {count > 0 && (
          <span className="dot-badge">{count > 99 ? "99+" : count}</span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 320,
            maxHeight: 420,
            background: "var(--app-card)",
            border: "1.5px solid var(--app-border)",
            borderRadius: 14,
            padding: 6,
            boxShadow: "0 16px 40px -10px rgba(0,0,0,0.45)",
            zIndex: 50,
            overflow: "auto",
          }}
        >
          {items.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--app-fg-3)",
                padding: 14,
                margin: 0,
              }}
            >
              {t("notifications.empty")}
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px 4px",
                borderBottom: "1px solid var(--app-border-2)",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "var(--app-fg-3)",
                }}
              >
                {t("notifications.openCount", { count: items.length })}
              </span>
              <button
                type="button"
                onClick={armOrClearAll}
                style={{
                  background: confirmingClear
                    ? "rgba(230,82,107,0.12)"
                    : "transparent",
                  border: confirmingClear
                    ? "1px solid rgba(230,82,107,0.5)"
                    : "1px solid transparent",
                  color: confirmingClear ? "var(--rose)" : "var(--app-fg-2)",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 6,
                  transition: "background 0.12s, color 0.12s",
                }}
                title={
                  confirmingClear
                    ? t("notifications.clear.confirmTitle")
                    : t("notifications.clear.title")
                }
              >
                {confirmingClear
                  ? t("notifications.clear.confirm")
                  : t("notifications.clear")}
              </button>
            </div>
          )}
          {groupedItems.map(({ id, items: arr, business: biz }) => {
            const collapsed = collapsedGroups.has(id);
            const bizIcon = biz ? getAppIcon(biz.icon, 10) : null;
            return (
              <div key={id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={() => toggleGroup(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 12px 4px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: "var(--app-fg-3)",
                    textAlign: "left",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      color: "var(--app-fg-3)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
                      transition: "transform 0.12s ease",
                    }}
                  >
                    <ChevronRightIcon size={12} />
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: businessColor(biz),
                      color: businessTextColor(biz),
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  >
                    {biz?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={biz.logo_url}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : bizIcon ? (
                      bizIcon
                    ) : biz ? (
                      biz.letter
                    ) : (
                      "."
                    )}
                  </span>
                  <span style={{ flex: 1 }}>
                    {biz ? biz.name : t("notifications.workspace")}
                  </span>
                  <span
                    style={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 10,
                      color: "var(--app-fg-2)",
                    }}
                  >
                    {arr.length}
                  </span>
                </button>
                {!collapsed &&
                  arr.map((n) => {
                    const href = routeForNotification(n);
                    return (
                      <a
                        key={`${n.kind}:${n.id}`}
                        href={href}
                        onClick={(e) => {
                          if (!isPlainLeftClick(e)) return;
                          e.preventDefault();
                          dismiss(n.kind, n.id);
                          setOpen(false);
                          router.push(href);
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          width: "100%",
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          borderRadius: 8,
                          cursor: "pointer",
                          textAlign: "left",
                          color: "var(--app-fg)",
                          textDecoration: "none",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "var(--app-card-2)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background:
                                n.state === "fail" || n.state === "failed"
                                  ? "var(--rose)"
                                  : "var(--amber)",
                            }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {n.title}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--app-fg-3)",
                            marginTop: 2,
                            marginLeft: 16,
                          }}
                        >
                          {n.kind === "run"
                            ? t("notifications.kind.runFailed")
                            : t("notifications.kind.queue")}{" "}
                          - {new Date(n.created_at).toLocaleString(dateLocale)}
                        </span>
                      </a>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
