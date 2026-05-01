// Recent runs for a business — server component, pure markup. Phase 5.5
// shows status + trigger + duration; phase 6 will link each row to a
// detail drawer with input/output diff.

import type { AgentRow } from "../lib/queries/agents";
import type { RunRow } from "../lib/queries/schedules";

type Props = { runs: RunRow[]; agents: AgentRow[] };

export function RunsTimeline({ runs, agents }: Props) {
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
              : r.status === "running"
                ? "var(--tt-green)"
                : "var(--app-fg-3)";
        return (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "10px 1fr auto",
              gap: 12,
              padding: "10px 14px",
              borderTop: i === 0 ? "none" : "1px solid var(--app-border-2)",
            }}
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
  );
}
