// Full runs list with filters. Server-component renders the initial
// page; "Load more" hits /api/agents/runs to grab the next slice via
// the (RLS-respecting) Supabase REST. We render through a client
// component so the filters can drive the URL and the list updates
// without a full page reload.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { AgentRow } from "../lib/queries/agents";

type Run = {
  id: string;
  agent_id: string | null;
  status: string;
  triggered_by: string;
  duration_ms: number | null;
  cost_cents: number;
  output: { text?: string } | null;
  error_text: string | null;
  created_at: string;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  agents: AgentRow[];
  statusFilter: string | null;
  agentFilter: string | null;
  offset: number;
};

const PAGE_SIZE = 25;

export function RunsPage({
  workspaceSlug,
  workspaceId,
  businessId,
  agents,
  statusFilter,
  agentFilter,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch whenever filters change.
  useEffect(() => {
    setRuns([]);
    setOffset(0);
    setHasMore(false);
  }, [statusFilter, agentFilter]);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      business: businessId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (agentFilter) params.set("agent", agentFilter);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/api/runs?${params.toString()}`, { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{ runs: Run[]; hasMore: boolean }>;
      })
      .then((data) => {
        setRuns((prev) =>
          offset === 0 ? data.runs : [...prev, ...data.runs],
        );
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
    return () => ctl.abort();
  }, [businessId, statusFilter, agentFilter, offset]);

  const setFilter = (k: "status" | "agent", v: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (v) sp.set(k, v);
    else sp.delete(k);
    sp.delete("offset");
    router.push(
      `/${workspaceSlug}/business/${businessId}/runs?${sp.toString()}`,
    );
  };

  const agentName = (id: string | null) =>
    agents.find((a) => a.id === id)?.name ?? "(onbekend)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FilterPill
          active={!statusFilter}
          label="Alle statuses"
          onClick={() => setFilter("status", null)}
        />
        {(["queued", "running", "done", "failed", "review"] as const).map(
          (s) => (
            <FilterPill
              key={s}
              active={statusFilter === s}
              label={s}
              onClick={() => setFilter("status", s)}
            />
          ),
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FilterPill
          active={!agentFilter}
          label="Alle agents"
          onClick={() => setFilter("agent", null)}
        />
        {agents.map((a) => (
          <FilterPill
            key={a.id}
            active={agentFilter === a.id}
            label={a.name}
            onClick={() => setFilter("agent", a.id)}
          />
        ))}
      </div>

      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12 }}>{error}</p>
      )}

      {runs.length === 0 && !loading ? (
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13,
            padding: 16,
            border: "1.5px dashed var(--app-border)",
            borderRadius: 12,
          }}
        >
          Geen runs voor deze filter.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            border: "1px solid var(--app-border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {runs.map((r) => (
            <RunRow key={r.id} run={r} agentName={agentName(r.agent_id)} />
          ))}
        </div>
      )}

      {loading && (
        <p style={{ color: "var(--app-fg-3)", fontSize: 12 }}>Laden…</p>
      )}

      {hasMore && !loading && (
        <button
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          style={{
            padding: "8px 14px",
            border: "1.5px solid var(--app-border)",
            background: "transparent",
            color: "var(--app-fg)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            alignSelf: "center",
          }}
        >
          Meer laden
        </button>
      )}
    </div>
  );
}

function RunRow({ run, agentName }: { run: Run; agentName: string }) {
  const [expanded, setExpanded] = useState(false);
  const failed = run.status === "failed" || run.status === "fail";
  const ok = run.status === "done";
  const text = run.output?.text ?? run.error_text ?? "";

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--app-card)",
        borderBottom: "1px solid var(--app-border-2)",
        cursor: text ? "pointer" : "default",
      }}
      onClick={() => text && setExpanded((v) => !v)}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: failed
              ? "var(--rose)"
              : ok
                ? "var(--tt-green)"
                : "var(--amber)",
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 700 }}>{agentName}</span>
        <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
          {run.status} · {run.triggered_by}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--app-fg-3)" }}>
          {run.duration_ms != null && run.duration_ms > 0
            ? `${(run.duration_ms / 1000).toFixed(1)}s · `
            : ""}
          €{(run.cost_cents / 100).toFixed(4)} ·{" "}
          {new Date(run.created_at).toLocaleString("nl-NL")}
        </span>
      </div>
      {expanded && text && (
        <pre
          style={{
            marginTop: 8,
            padding: 8,
            fontSize: 11,
            background: "var(--app-card-2)",
            border: "1px solid var(--app-border-2)",
            borderRadius: 6,
            color: failed ? "var(--rose)" : "var(--app-fg-2)",
            whiteSpace: "pre-wrap",
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {text.slice(0, 4000)}
          {text.length > 4000 ? "\n… (truncated)" : ""}
        </pre>
      )}
    </div>
  );
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        border: `1.5px solid ${active ? "var(--tt-green)" : "var(--app-border)"}`,
        background: active ? "rgba(57,178,85,0.10)" : "transparent",
        color: active ? "var(--tt-green)" : "var(--app-fg-2)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
