// Recent runs for a business — clickable timeline. Phase 5.5 just shows
// status + trigger + duration; clicking a row now opens the
// RunDetailDrawer (chat-style replay of the run).

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { AgentRow } from "../lib/queries/agents";
import type { RunRow } from "../lib/queries/schedules";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { RunDetailDrawer } from "./RunDetailDrawer";

type Props = {
  runs: RunRow[];
  agents: AgentRow[];
  /** When set, scope the realtime subscription to this business so we
   *  don't pay for events from other businesses in the same workspace. */
  businessId?: string;
  workspaceId?: string;
};

export function RunsTimeline({ runs, agents, businessId, workspaceId }: Props) {
  const router = useRouter();
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  // Live updates: when any runs row in this scope changes (insert /
  // update / delete), refetch the server component so the timeline
  // reflects the new status without the user having to refresh. Cheap
  // because the schedules page is already a small render.
  useEffect(() => {
    if (!workspaceId && !businessId) return;
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    const filter = businessId
      ? `business_id=eq.${businessId}`
      : `workspace_id=eq.${workspaceId}`;
    const ch = supabase
      .channel(`runs-timeline:${businessId ?? workspaceId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "aio_control", table: "runs", filter },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [businessId, workspaceId, router]);

  if (runs.length === 0) {
    return (
      <p
        style={{
          color: "var(--app-fg-3)",
          fontSize: 13,
          padding: 16,
          border: "1.5px dashed var(--app-border)",
          borderRadius: 12,
        }}
      >
        Geen runs in de afgelopen tijd. Trigger er één via "Run now" of een
        webhook om hier verloop te zien verschijnen.
      </p>
    );
  }
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--app-card)",
          border: "1.5px solid var(--app-border)",
          borderRadius: 14,
        }}
      >
        {runs.map((r, i) => {
          const agent = agents.find((a) => a.id === r.agent_id);
          const tone =
            r.status === "failed"
              ? "var(--rose)"
              : r.status === "review"
                ? "var(--amber)"
                : r.status === "running" || r.status === "done"
                  ? "var(--tt-green)"
                  : "var(--app-fg-3)";
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenRunId(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenRunId(r.id);
                }
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "10px 1fr auto",
                gap: 12,
                padding: "10px 14px",
                borderTop: i === 0 ? "none" : "1px solid var(--app-border-2)",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--app-card-2)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  marginTop: 7,
                  borderRadius: 999,
                  background: tone,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {agent?.name ?? "Onbekende agent"}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: tone,
                      marginLeft: 8,
                    }}
                  >
                    {r.status}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--app-fg-3)",
                    marginTop: 2,
                  }}
                >
                  {r.triggered_by}
                  {r.duration_ms != null
                    ? ` · ${(r.duration_ms / 1000).toFixed(1)}s`
                    : ""}
                  {r.cost_cents
                    ? ` · ${(r.cost_cents / 100).toFixed(2)}€`
                    : ""}
                  {r.error_text ? ` · ${r.error_text}` : ""}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--app-fg-3)",
                  whiteSpace: "nowrap",
                }}
              >
                {new Date(r.created_at).toLocaleString("nl-NL")}
              </div>
            </div>
          );
        })}
      </div>
      {openRunId && (
        <RunDetailDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
      )}
    </>
  );
}
