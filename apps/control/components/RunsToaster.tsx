// Listens to Supabase Realtime postgres_changes on the `runs` table for the
// current workspace and flashes a toast on insert/update. Phase 3 ships the
// minimal toast UX; phase 4 will route status updates into the active chat
// thread as system-messages.

"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Toast = { id: number; text: string; tone: "ok" | "warn" | "bad" };

type Props = { workspaceId: string };

export function RunsToaster({ workspaceId }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      // No Supabase env yet — skip silently so the page still renders.
      return;
    }

    let toastSeq = 0;
    type ChangePayload = {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    };
    const channel = supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .channel(`runs:${workspaceId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "runs",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: ChangePayload) => {
          const newRow = (payload.new ?? {}) as {
            status?: string;
            agent_id?: string;
            triggered_by?: string;
          };
          const tone =
            newRow.status === "failed"
              ? "bad"
              : newRow.status === "review"
                ? "warn"
                : "ok";
          const text =
            payload.eventType === "INSERT"
              ? `Run gestart (${newRow.triggered_by ?? "?"})`
              : `Run ${newRow.status ?? "updated"}`;
          const id = ++toastSeq;
          setToasts((t) => [...t, { id, text, tone }]);
          setTimeout(() => {
            setToasts((t) => t.filter((tt) => tt.id !== id));
          }, 4500);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 18,
        left: 18,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 11,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background:
              t.tone === "bad"
                ? "rgba(230,82,107,0.14)"
                : t.tone === "warn"
                  ? "rgba(240,179,64,0.16)"
                  : "rgba(57,178,85,0.14)",
            border:
              t.tone === "bad"
                ? "1.5px solid var(--rose)"
                : t.tone === "warn"
                  ? "1.5px solid var(--amber)"
                  : "1.5px solid var(--tt-green)",
            color:
              t.tone === "bad"
                ? "var(--rose)"
                : t.tone === "warn"
                  ? "var(--amber)"
                  : "var(--tt-green)",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 700,
            boxShadow: "0 12px 24px -8px rgba(0,0,0,0.35)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
