// Server component — renders a topic-scoped dashboard. Mounted from
// the per-topic page (/[ws]/business/[bizId]/n/[...path]) above the
// children grid. Rolls up: this topic + all descendants via the
// recursive descendant_nav_node_ids RPC from migration 043.
//
// Layout intentionally mirrors BusinessDashboard's KPI tiles + run-
// list section so the design feels consistent. We don't try to share
// the JSX yet — premature abstraction. When a third surface needs
// the same shape we extract a `<ScopedDashboard>`.

import Link from "next/link";

import { getDict } from "../lib/i18n/server";
import { listDescendantNavNodeIds } from "../lib/queries/nav-nodes";
import { createSupabaseServerClient } from "../lib/supabase/server";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  navNodeId: string;
  /** When true, includes all descendant nav-nodes in the rollup
   *  (the user-confirmed default — topics show their own state PLUS
   *  whatever lives under them). When false, only the leaf topic. */
  includeDescendants?: boolean;
};

const fmtEur = (n: number) =>
  n.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });

export async function TopicDashboard({
  workspaceSlug,
  workspaceId,
  businessId,
  navNodeId,
  includeDescendants = true,
}: Props) {
  const { t } = await getDict();
  const supabase = await createSupabaseServerClient();

  // Roll-up scope: this topic + descendants when includeDescendants,
  // otherwise just the leaf id. Single round-trip via the SQL function.
  const scopeIds = includeDescendants
    ? await listDescendantNavNodeIds(navNodeId)
    : [navNodeId];

  // Pull agents / recent runs / open queue for this scope in parallel.
  // workspace_id stays in every WHERE so RLS stays tight even in the
  // edge case the nav_node_id chain crosses workspaces (it shouldn't).
  const since30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [agentsRes, runs30dRes, runs24hRes, queueRes, schedulesRes] =
    await Promise.all([
      supabase
        .from("agents")
        .select("id, name, provider, archived_at")
        .eq("workspace_id", workspaceId)
        .in("nav_node_id", scopeIds)
        .is("archived_at", null),
      supabase
        .from("runs")
        .select("status, cost_cents, created_at")
        .eq("workspace_id", workspaceId)
        .in("nav_node_id", scopeIds)
        .gte("created_at", since30d),
      supabase
        .from("runs")
        .select("id, status, agent_id, started_at, ended_at, error_text, created_at")
        .eq("workspace_id", workspaceId)
        .in("nav_node_id", scopeIds)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("queue_items")
        .select("id, title, state, created_at")
        .eq("workspace_id", workspaceId)
        .in("nav_node_id", scopeIds)
        .is("resolved_at", null)
        .in("state", ["review", "fail"])
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("schedules")
        .select("id, kind, enabled")
        .eq("workspace_id", workspaceId)
        .in("nav_node_id", scopeIds),
    ]);

  type AgentRow = { id: string; name: string; provider: string };
  type RunRow30 = { status: string; cost_cents: number; created_at: string };
  type RunRow = {
    id: string;
    status: string;
    agent_id: string | null;
    started_at: string | null;
    ended_at: string | null;
    error_text: string | null;
    created_at: string;
  };
  type QueueRow = {
    id: string;
    title: string;
    state: string;
    created_at: string;
  };
  type ScheduleRow = {
    id: string;
    kind: string;
    enabled: boolean;
  };

  const agents = (agentsRes.data ?? []) as AgentRow[];
  const runs30d = (runs30dRes.data ?? []) as RunRow30[];
  const runs24h = (runs24hRes.data ?? []) as RunRow[];
  const queue = (queueRes.data ?? []) as QueueRow[];
  const schedules = (schedulesRes.data ?? []) as ScheduleRow[];

  const agentById = new Map(agents.map((a) => [a.id, a.name] as const));

  const cost30dCents = runs30d.reduce((acc, r) => acc + (r.cost_cents ?? 0), 0);
  const failed24h = runs24h.filter((r) => r.status === "failed").length;
  const successful24h = runs24h.filter((r) => r.status === "done").length;
  const activeRoutines = schedules.filter(
    (s) => s.enabled && (s.kind === "cron" || s.kind === "webhook"),
  ).length;

  return (
    <section
      style={{
        marginBottom: 22,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* ── KPI strip ────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <Tile label={t("topic.kpi.agents")} value={String(agents.length)} />
        <Tile
          label={t("topic.kpi.activeRoutines")}
          value={String(activeRoutines)}
          accent={activeRoutines > 0 ? "ok" : "neutral"}
        />
        <Tile
          label={t("topic.kpi.runs24h")}
          value={String(runs24h.length)}
          accent={runs24h.length > 0 ? "ok" : "neutral"}
        />
        <Tile
          label={t("topic.kpi.successFail24h")}
          value={`${successful24h} / ${failed24h}`}
          accent={failed24h > 0 ? "warn" : "neutral"}
        />
        <Tile label={t("topic.kpi.cost30d")} value={fmtEur(cost30dCents / 100)} />
      </div>

      {/* ── Two-column: open queue · recent runs ──────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 14,
        }}
      >
        <div>
          <SectionHeader title={t("topic.openQueue")} />
          {queue.length === 0 ? (
            <Empty body={t("topic.queueEmpty")} />
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {queue.map((q) => (
                <li
                  key={q.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "8px 1fr auto",
                    gap: 8,
                    padding: "8px 10px",
                    border: "1px solid var(--app-border-2)",
                    borderRadius: 10,
                    fontSize: 12.5,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background:
                        q.state === "fail" ? "var(--rose)" : "var(--amber)",
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>{q.title}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--app-fg-3)",
                    }}
                  >
                    {new Date(q.created_at).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <SectionHeader
            title={t("topic.recentRuns")}
            cta={{
              label: t("topic.history"),
              href: `/${workspaceSlug}/business/${businessId}/runs`,
            }}
          />
          {runs24h.length === 0 ? (
            <Empty body={t("topic.runsEmpty")} slim />
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {runs24h.map((r) => (
                <li
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "8px 1fr auto",
                    gap: 8,
                    padding: "8px 10px",
                    border: "1px solid var(--app-border-2)",
                    borderRadius: 10,
                    fontSize: 12,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background:
                        r.status === "failed"
                          ? "var(--rose)"
                          : r.status === "review"
                            ? "var(--amber)"
                            : "var(--tt-green)",
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>
                    {agentById.get(r.agent_id ?? "") ?? "—"} · {r.status}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                    {new Date(r.created_at).toLocaleTimeString("nl-NL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string;
  accent?: "ok" | "warn" | "neutral";
}) {
  const colour =
    accent === "ok"
      ? "var(--tt-green)"
      : accent === "warn"
        ? "var(--amber)"
        : "var(--app-fg)";
  return (
    <div
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--app-fg-3)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 19,
          fontWeight: 700,
          marginTop: 4,
          color: colour,
          fontFamily: "var(--type)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  cta,
}: {
  title: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 8,
      }}
    >
      <h3
        style={{
          fontFamily: "var(--hand)",
          fontSize: 18,
          fontWeight: 700,
          margin: 0,
        }}
      >
        {title}
      </h3>
      {cta && (
        <Link
          href={cta.href}
          style={{
            fontSize: 11.5,
            color: "var(--tt-green)",
            fontWeight: 700,
          }}
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

function Empty({ body, slim }: { body: string; slim?: boolean }) {
  return (
    <div
      style={{
        padding: slim ? "12px 14px" : "20px 16px",
        border: "1.5px dashed var(--app-border)",
        borderRadius: 12,
        textAlign: "center",
        fontSize: 12.5,
        color: "var(--app-fg-3)",
      }}
    >
      {body}
    </div>
  );
}
