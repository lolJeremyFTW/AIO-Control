// Full runs list with filters. Server-component renders the initial
// page; "Load more" hits /api/agents/runs to grab the next slice via
// the (RLS-respecting) Supabase REST. We render through a client
// component so the filters can drive the URL and the list updates
// without a full page reload.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { AgentRow } from "../lib/queries/agents";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { RunDetailDrawer } from "./RunDetailDrawer";

type Run = {
  id: string;
  agent_id: string | null;
  business_id: string | null;
  status: string;
  triggered_by: string;
  duration_ms: number | null;
  cost_cents: number;
  output: { text?: string } | null;
  error_text: string | null;
  created_at: string;
  schedule_id: string | null;
  schedules: { title: string | null } | null;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  /** When set, filter to one business. When null we list across the
   *  entire workspace and show a per-business label on each run. */
  businessId: string | null;
  agents: AgentRow[];
  /** Map business_id → name so workspace-wide rows can render which
   *  business they belong to. */
  businessName?: Record<string, string>;
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
  businessName,
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
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  // Bumped on realtime events — the fetch effect below depends on this so
  // we re-run the same query path that pagination uses, no duplication.
  const [tick, setTick] = useState(0);

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
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (businessId) params.set("business", businessId);
    else params.set("workspace", workspaceId);
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
  }, [businessId, workspaceId, statusFilter, agentFilter, offset, tick]);

  // Live updates: re-fetch the visible page whenever a runs row changes
  // in this business/workspace scope. Same channel pattern as
  // NotificationsBell + RunsTimeline; we just bump `tick` to retrigger
  // the fetch effect above without duplicating its query logic.
  useEffect(() => {
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
      .channel(`runs-page:${businessId ?? workspaceId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "aio_control", table: "runs", filter },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [businessId, workspaceId]);

  const setFilter = (k: "status" | "agent", v: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (v) sp.set(k, v);
    else sp.delete(k);
    sp.delete("offset");
    const base = businessId
      ? `/${workspaceSlug}/business/${businessId}/runs`
      : `/${workspaceSlug}/runs`;
    router.push(`${base}?${sp.toString()}`);
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
            <RunRow
              key={r.id}
              run={r}
              agentName={agentName(r.agent_id)}
              businessLabel={
                !businessId && r.business_id
                  ? (businessName?.[r.business_id] ?? null)
                  : null
              }
              scheduleTitle={r.schedules?.title ?? null}
              onOpen={() => setOpenRunId(r.id)}
            />
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
      {openRunId && (
        <RunDetailDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
      )}
    </div>
  );
}

function RunRow({
  run,
  agentName,
  businessLabel,
  scheduleTitle,
  onOpen,
}: {
  run: Run;
  agentName: string;
  businessLabel: string | null;
  scheduleTitle: string | null;
  onOpen: () => void;
}) {
  const failed = run.status === "failed" || run.status === "fail";
  const ok = run.status === "done";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        padding: "12px 14px",
        background: "var(--app-card)",
        borderBottom: "1px solid var(--app-border-2)",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--app-card-2)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--app-card)")
      }
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
        {businessLabel && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 999,
              background: "var(--app-card-2)",
              color: "var(--app-fg-2)",
              letterSpacing: "0.08em",
            }}
          >
            {businessLabel}
          </span>
        )}
        <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
          {run.status} · {run.triggered_by}
          {scheduleTitle && ` · ${scheduleTitle}`}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--app-fg-3)" }}>
          {run.duration_ms != null && run.duration_ms > 0
            ? `${(run.duration_ms / 1000).toFixed(1)}s · `
            : ""}
          €{(run.cost_cents / 100).toFixed(4)} ·{" "}
          {new Date(run.created_at).toLocaleString("nl-NL")}
        </span>
      </div>
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
