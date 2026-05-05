// Listens to Supabase Realtime postgres_changes on the `runs` table for the
// current workspace and flashes a toast on insert/update. Phase 3 ships the
// minimal toast UX; phase 4 will route status updates into the active chat
// thread as system-messages.

"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Toast = {
  id: number;
  text: string;
  tone: "ok" | "warn" | "bad";
  cost?: number; // cost_cents
  inputTokens?: number;
  outputTokens?: number;
};

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
          schema: "aio_control",
          table: "runs",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: ChangePayload) => {
          const newRow = (payload.new ?? {}) as {
            status?: string;
            agent_id?: string;
            triggered_by?: string;
            cost_cents?: number;
            input_tokens?: number;
            output_tokens?: number;
          };
          const tone =
            newRow.status === "failed"
              ? "bad"
              : newRow.status === "review"
                ? "warn"
                : "ok";

          let text: string;
          let cost: number | undefined;
          let inputTokens: number | undefined;
          let outputTokens: number | undefined;

          // Skip transient internal states — no toast needed.
          if (newRow.status === "running" || newRow.status === "queued") return;

          if (payload.eventType === "INSERT") {
            text = `Run gestart (${newRow.triggered_by ?? "?"})`;
          } else if (newRow.status === "done") {
            cost = newRow.cost_cents;
            inputTokens = newRow.input_tokens;
            outputTokens = newRow.output_tokens;
            const costStr = cost != null ? `Kosten €${(cost / 100).toFixed(4)}` : null;
            const tokenStr =
              inputTokens != null || outputTokens != null
                ? `${inputTokens?.toLocaleString() ?? "?"} in / ${outputTokens?.toLocaleString() ?? "?"} out`
                : null;
            const parts = [costStr, tokenStr].filter(Boolean);
            text = parts.length > 0 ? `Run klaar — ${parts.join(" | ")}` : "Run klaar";
          } else if (newRow.status === "failed") {
            cost = newRow.cost_cents;
            text = cost != null && cost > 0
              ? `Run failed — Kosten €${(cost / 100).toFixed(4)}`
              : "Run failed";
          } else {
            text = `Run ${newRow.status ?? "updated"}`;
          }

          const id = ++toastSeq;
          setToasts((t) => [...t, { id, text, tone, cost, inputTokens, outputTokens }]);
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
