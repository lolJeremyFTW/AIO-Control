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

type Props = { workspaceSlug: string; workspaceId: string };

export function NotificationsBell({ workspaceSlug, workspaceId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const res = await fetch(`${base}/api/notifications`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { items: Notif[] };
      setItems(data.items);
    }
  };

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
            items.map((n) => (
              <button
                key={`${n.kind}:${n.id}`}
                onClick={() => {
                  setOpen(false);
                  router.push(
                    n.business_id
                      ? `/${workspaceSlug}/business/${n.business_id}${n.kind === "run" ? "/schedules" : ""}`
                      : `/${workspaceSlug}/dashboard`,
                  );
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  padding: "10px 12px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--app-card-2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</span>
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
            ))
          )}
        </div>
      )}
    </div>
  );
}
