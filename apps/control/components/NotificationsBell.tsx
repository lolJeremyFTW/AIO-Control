// Header bell + popover. Pulls open queue items + recent failed runs
// from /api/notifications and shows them as a clickable list. Auto-
// refreshes via Supabase Realtime postgres_changes the moment a row
// lands — same channel as RunsToaster, just consumed differently.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BellIcon } from "@aio/ui/icon";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Notif = {
  kind: "queue" | "run";
  id: string;
  title: string;
  sub: string;
  state: "review" | "fail" | "failed";
  business_id: string | null;
  created_at: string;
};

type BusinessLookup = {
  id: string;
  name: string;
  /** First letter for the avatar dot when no icon is set. */
  letter: string;
  variant: string;
  /** Optional custom hex (overrides variant). */
  color_hex?: string | null;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  /** Workspace businesses — used to render a per-business header
   *  (avatar dot + name) above each notification group. */
  businesses?: BusinessLookup[];
};

export function NotificationsBell({
  workspaceSlug,
  workspaceId,
  businesses = [],
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  // Two-step confirm for the bulk dismiss — avoids the "I clicked the
  // wrong button and lost my whole list" footgun. First click flips the
  // label; a second click within 4 s commits, otherwise it resets.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = async () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const res = await fetch(`${base}/api/notifications`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { items: Notif[] };
      setItems(data.items);
    }
  };

  // Mark a notification as dismissed for the current user. Notifications
  // are synthesized from queue_items + failed runs — dismissal is per-user
  // (POST writes notification_dismissals). We optimistically remove it
  // locally so the bell empties out instantly when the user clicks.
  const dismiss = (kind: "queue" | "run", id: string) => {
    setItems((prev) => prev.filter((n) => !(n.kind === kind && n.id === id)));
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    void fetch(`${base}/api/notifications/dismiss`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id }),
    }).catch(() => {
      // On failure the next refresh() will repopulate it — better than
      // leaving the user staring at a stale list. Silent retry next tick.
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
        body: JSON.stringify({ kind: n.kind, id: n.id }),
      }).catch(() => {});
    }
  };

  // Two-step confirm: first click arms, second click within 4s commits.
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

  // Always reset the arm state when the popover closes so the user
  // doesn't reopen it later and hit a hot button by accident.
  useEffect(() => {
    if (!open) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
      setConfirmingClear(false);
    }
  }, [open]);

  useEffect(() => {
    void refresh();
  }, []);

  // Refresh whenever a queue_items or runs row changes for this
  // workspace. Realtime gives us the push, then we re-fetch the list
  // (cheaper than maintaining client-side state for partial updates).
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    type Payload = { eventType: "INSERT" | "UPDATE" | "DELETE" };
    const ch = supabase
      .channel(`notifs:${workspaceId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "aio_control",
          table: "queue_items",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (_p: Payload) => void refresh(),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "aio_control",
          table: "runs",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (_p: Payload) => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [workspaceId]);

  // Click-outside dismiss.
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

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="ibtn"
        aria-label="Notifications"
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
              Niets om te reviewen — geen open queue items en geen failed
              runs.
            </p>
          ) : (
            <>
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
                  {items.length} open
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
                    color: confirmingClear
                      ? "var(--rose)"
                      : "var(--app-fg-2)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "2px 8px",
                    borderRadius: 6,
                    transition: "background 0.12s, color 0.12s",
                  }}
                  title={
                    confirmingClear
                      ? "Klik nogmaals om te bevestigen"
                      : "Wis alle notificaties voor jou"
                  }
                >
                  {confirmingClear ? "Bevestig?" : "Wis alles"}
                </button>
              </div>
            </>
          )}
          {items.length > 0 && (
            (() => {
              // Group items by business_id so the user sees per-
              // business sections — same shape they'll recognise from
              // the rail badges. Workspace-wide items (business_id IS
              // NULL) get a "Workspace" header at the top.
              const groups = new Map<string | "_global", Notif[]>();
              for (const n of items) {
                const k = (n.business_id ?? "_global") as string | "_global";
                const arr = groups.get(k) ?? [];
                arr.push(n);
                groups.set(k, arr);
              }
              const order = [
                "_global",
                ...businesses.map((b) => b.id),
              ];
              return order
                .filter((id) => groups.has(id))
                .map((id) => {
                  const arr = groups.get(id)!;
                  const biz =
                    id === "_global"
                      ? null
                      : businesses.find((b) => b.id === id) ?? null;
                  return (
                    <div key={id} style={{ marginBottom: 4 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 12px 4px",
                          fontSize: 10.5,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          textTransform: "uppercase",
                          color: "var(--app-fg-3)",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background:
                              biz?.color_hex ??
                              (biz
                                ? `var(--${biz.variant}, var(--tt-green))`
                                : "var(--app-fg-3)"),
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 9,
                            fontWeight: 800,
                          }}
                        >
                          {biz ? biz.letter : "·"}
                        </span>
                        <span style={{ flex: 1 }}>
                          {biz ? biz.name : "Workspace"}
                        </span>
                        <span
                          style={{
                            fontFamily:
                              "ui-monospace, Menlo, monospace",
                            fontSize: 10,
                            color: "var(--app-fg-2)",
                          }}
                        >
                          {arr.length}
                        </span>
                      </div>
                      {arr.map((n) => (
                        <button
                          key={`${n.kind}:${n.id}`}
                          onClick={() => {
                            dismiss(n.kind, n.id);
                            setOpen(false);
                            router.push(
                              n.business_id
                                ? `/${workspaceSlug}/business/${n.business_id}${
                                    n.kind === "run" ? "/runs" : ""
                                  }`
                                : `/${workspaceSlug}/queue`,
                            );
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
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "var(--app-card-2)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              "transparent")
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
                                  n.state === "fail" ||
                                  n.state === "failed"
                                    ? "var(--rose)"
                                    : "var(--amber)",
                              }}
                            />
                            <span
                              style={{ fontSize: 13, fontWeight: 600 }}
                            >
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
                            {n.kind === "run" ? "Run failed" : "Wachtrij"} ·{" "}
                            {new Date(n.created_at).toLocaleString("nl-NL")}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                });
            })()
          )}
        </div>
      )}
    </div>
  );
}

