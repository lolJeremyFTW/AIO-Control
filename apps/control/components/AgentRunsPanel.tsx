// Inline expandable runs panel that lives inside an agent card. Shows
// the last 10 runs for that specific agent with status, cost, duration
// + collapsible output preview. Lazily fetches when first expanded.

"use client";

import { useEffect, useState } from "react";

type Run = {
  id: string;
  status: string;
  triggered_by: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  cost_cents: number;
  output: { text?: string } | null;
  error_text: string | null;
  created_at: string;
  schedule_id: string | null;
  schedules: { title: string | null } | null;
};

type Props = {
  agentId: string;
  workspaceSlug: string;
};

export function AgentRunsPanel({ agentId, workspaceSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || runs.length > 0) return;
    setLoading(true);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(
      `${base}/api/agents/${agentId}/runs?limit=10`,
      { credentials: "same-origin" },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{ runs: Run[] }>;
      })
      .then((data) => setRuns(data.runs ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load runs"),
      )
      .finally(() => setLoading(false));
  }, [open, runs.length, agentId, workspaceSlug]);

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={(e) => {
          // The whole AgentCard is clickable to open the edit dialog;
          // stop the bubble so toggling runs doesn't also fire edit.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          background: "transparent",
          border: "1px solid var(--app-border-2)",
          color: "var(--app-fg-2)",
          padding: "5px 10px",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{open ? "▼ Verberg runs" : "▶ Recente runs"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {loading && (
            <p style={{ fontSize: 11, color: "var(--app-fg-3)" }}>Laden…</p>
          )}
          {error && (
            <p style={{ fontSize: 11, color: "var(--rose)" }}>{error}</p>
          )}
          {!loading && !error && runs.length === 0 && (
            <p style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
              Nog geen runs.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {runs.map((r) => (
              <RunRow key={r.id} run={r} scheduleTitle={r.schedules?.title ?? null} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ run, scheduleTitle }: { run: Run; scheduleTitle: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const ok = run.status === "done";
  const fail = run.status === "failed" || run.status === "fail";
  const color = fail
    ? "var(--rose)"
    : ok
      ? "var(--tt-green)"
      : "var(--amber)";
  const text = run.output?.text ?? run.error_text ?? "";

  return (
    <div
      style={{
        border: "1px solid var(--app-border-2)",
        borderRadius: 8,
        padding: "6px 8px",
        background: "var(--app-card-2)",
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          cursor: text ? "pointer" : "default",
        }}
        onClick={() => text && setExpanded((v) => !v)}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: color,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, color: "var(--app-fg)" }}>
            {run.status}
          </span>
          <span style={{ color: "var(--app-fg-3)" }}>
            · {run.triggered_by}{scheduleTitle && ` · ${scheduleTitle}`}
          </span>
        </div>
        <div style={{ color: "var(--app-fg-3)", fontSize: 10.5 }}>
          {run.duration_ms != null && run.duration_ms > 0
            ? `${(run.duration_ms / 1000).toFixed(1)}s · `
            : ""}
          €{(run.cost_cents / 100).toFixed(4)} ·{" "}
          {new Date(run.created_at).toLocaleString("nl-NL", {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      {expanded && text && (
        <pre
          style={{
            marginTop: 6,
            padding: 6,
            fontSize: 10.5,
            background: "var(--app-card)",
            border: "1px solid var(--app-border-2)",
            borderRadius: 6,
            color: fail ? "var(--rose)" : "var(--app-fg-2)",
            whiteSpace: "pre-wrap",
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {text.slice(0, 2000)}
          {text.length > 2000 ? "\n… (truncated)" : ""}
        </pre>
      )}
    </div>
  );
}
