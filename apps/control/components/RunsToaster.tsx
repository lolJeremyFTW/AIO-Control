// Listens to Supabase Realtime postgres_changes on the runs table for the
// current workspace and flashes compact, actionable status toasts.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Toast = {
  id: number;
  runId?: string;
  title: string;
  detail?: string;
  meta?: string;
  tone: "ok" | "warn" | "bad";
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  agents?: Array<{ id: string; name: string }>;
};

const MAX_VISIBLE_TOASTS = 3;
const MAX_VISIBLE_FAILURES = 2;

function shortRunId(id?: string) {
  return id ? id.slice(0, 8) : "unknown";
}

function compactError(error?: string | null) {
  if (!error) return "Geen foutmelding opgeslagen.";
  const oneLine = error.replace(/\s+/g, " ").trim();
  return oneLine.length > 150 ? `${oneLine.slice(0, 147)}...` : oneLine;
}

function formatCost(costCents?: number) {
  return costCents != null
    ? `Kosten EUR ${(costCents / 100).toFixed(4)}`
    : null;
}

export function RunsToaster({
  workspaceId,
  workspaceSlug,
  agents = [],
}: Props) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenStatusRef = useRef<Map<string, string>>(new Map());
  const agentsRef = useRef(agents);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }

    let toastSeq = 0;
    const seenStatus = seenStatusRef.current;
    seenStatus.clear();
    type ChangePayload = {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    };
    const channel = supabase
      .channel(`runs:${workspaceId}`)

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "aio_control",
          table: "runs",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: ChangePayload) => {
          const newRow = (payload.new ?? {}) as {
            id?: string;
            status?: string;
            agent_id?: string;
            triggered_by?: string;
            cost_cents?: number;
            input_tokens?: number;
            output_tokens?: number;
            error_text?: string | null;
            created_at?: string;
          };
          const oldRow = (payload.old ?? {}) as {
            status?: string;
          };

          if (newRow.status === "running" || newRow.status === "queued") return;
          if (newRow.id) {
            const previousStatus = seenStatus.get(newRow.id) ?? oldRow.status;
            if (previousStatus === newRow.status) return;
            seenStatus.set(newRow.id, newRow.status ?? "");
          }

          const agentName =
            agentsRef.current.find((a) => a.id === newRow.agent_id)?.name ??
            "Onbekende agent";
          const trigger = newRow.triggered_by ?? "unknown";
          const time = newRow.created_at
            ? new Date(newRow.created_at).toLocaleTimeString("nl-NL", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null;
          const meta = [`run ${shortRunId(newRow.id)}`, trigger, time]
            .filter(Boolean)
            .join(" · ");

          const tone =
            newRow.status === "failed"
              ? "bad"
              : newRow.status === "review"
                ? "warn"
                : "ok";

          let title: string;
          let detail: string | undefined;
          let cost: number | undefined;
          let inputTokens: number | undefined;
          let outputTokens: number | undefined;

          if (payload.eventType === "INSERT") {
            title = `${agentName} gestart`;
          } else if (newRow.status === "done") {
            cost = newRow.cost_cents;
            inputTokens = newRow.input_tokens;
            outputTokens = newRow.output_tokens;
            const tokenStr =
              inputTokens != null || outputTokens != null
                ? `${inputTokens?.toLocaleString() ?? "?"} in / ${
                    outputTokens?.toLocaleString() ?? "?"
                  } out`
                : null;
            detail = [formatCost(cost), tokenStr].filter(Boolean).join(" | ");
            title = `${agentName} klaar`;
          } else if (newRow.status === "failed") {
            cost = newRow.cost_cents;
            title = `${agentName} failed`;
            detail = compactError(newRow.error_text);
            const costText = formatCost(cost);
            if (costText && cost && cost > 0)
              detail = `${detail} | ${costText}`;
          } else {
            title = `${agentName}: ${newRow.status ?? "updated"}`;
          }

          const id = ++toastSeq;
          const nextToast: Toast = {
            id,
            runId: newRow.id,
            title,
            detail: detail || undefined,
            meta,
            tone,
            cost,
            inputTokens,
            outputTokens,
          };
          setToasts((current) => {
            const failures = current.filter((t) => t.tone === "bad");
            const trimmed =
              tone === "bad" && failures.length >= MAX_VISIBLE_FAILURES
                ? current.filter((t) => t.id !== failures[0]?.id)
                : current;
            return [...trimmed, nextToast].slice(-MAX_VISIBLE_TOASTS);
          });
          setTimeout(
            () => {
              setToasts((current) =>
                current.filter((toast) => toast.id !== id),
              );
            },
            tone === "bad" ? 9000 : 4500,
          );
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
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => {
            if (toast.runId)
              router.push(`/${workspaceSlug}/runs?run=${toast.runId}`);
          }}
          title={toast.runId ? "Open run-details" : undefined}
          style={{
            background:
              toast.tone === "bad"
                ? "rgba(230,82,107,0.14)"
                : toast.tone === "warn"
                  ? "rgba(240,179,64,0.16)"
                  : "rgba(57,178,85,0.14)",
            border:
              toast.tone === "bad"
                ? "1.5px solid var(--rose)"
                : toast.tone === "warn"
                  ? "1.5px solid var(--amber)"
                  : "1.5px solid var(--tt-green)",
            color:
              toast.tone === "bad"
                ? "var(--rose)"
                : toast.tone === "warn"
                  ? "var(--amber)"
                  : "var(--tt-green)",
            padding: "10px 12px",
            borderRadius: 10,
            width: 340,
            maxWidth: "calc(100vw - 36px)",
            textAlign: "left",
            cursor: toast.runId ? "pointer" : "default",
            boxShadow: "0 12px 24px -8px rgba(0,0,0,0.35)",
          }}
        >
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>
            {toast.title}
          </span>
          {toast.detail && (
            <span
              style={{
                display: "block",
                marginTop: 3,
                color: "var(--app-fg)",
                fontSize: 11.5,
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              {toast.detail}
            </span>
          )}
          {toast.meta && (
            <span
              style={{
                display: "block",
                marginTop: 5,
                color: "var(--app-fg-3)",
                fontSize: 10.5,
                fontWeight: 700,
              }}
            >
              {toast.meta}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
