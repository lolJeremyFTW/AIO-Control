// Cost & spend dashboard — renders three tables (per business / per
// agent / per provider) plus a daily sparkline of total spend over the
// last 30 days. Server-rendered (RSC); the period toggle is purely
// presentational since all three windows are pre-aggregated in the
// underlying view.

"use client";

import { useState } from "react";

import type { BusinessRow } from "../lib/queries/businesses";
import type { AgentRow } from "../lib/queries/agents";

type Period = "24h" | "7d" | "30d";

export type CostByBusinessRow = {
  business_id: string;
  runs_24h: number;
  runs_7d: number;
  runs_30d: number;
  cost_24h_cents: number;
  cost_7d_cents: number;
  cost_30d_cents: number;
  failed_24h: number;
};

export type CostByAgentRow = {
  agent_id: string;
  runs_24h: number;
  runs_7d: number;
  runs_30d: number;
  cost_24h_cents: number;
  cost_7d_cents: number;
  cost_30d_cents: number;
};

export type CostByProviderRow = {
  provider: string;
  runs_24h: number;
  runs_7d: number;
  runs_30d: number;
  cost_24h_cents: number;
  cost_7d_cents: number;
  cost_30d_cents: number;
};

export type TimelineRow = {
  day: string;
  runs: number;
  cost_cents: number;
};

type Props = {
  businesses: BusinessRow[];
  agents: AgentRow[];
  byBusiness: CostByBusinessRow[];
  byAgent: CostByAgentRow[];
  byProvider: CostByProviderRow[];
  timeline: TimelineRow[];
};

export function CostDashboard({
  businesses,
  agents,
  byBusiness,
  byAgent,
  byProvider,
  timeline,
}: Props) {
  const [period, setPeriod] = useState<Period>("30d");

  const totals = {
    runs: byBusiness.reduce((acc, r) => acc + runsForPeriod(period)(r), 0),
    cost: byBusiness.reduce((acc, r) => acc + costForPeriod(period)(r), 0),
    failed: byBusiness.reduce((acc, r) => acc + r.failed_24h, 0),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--app-fg-2)" }}>
          Periode:
        </div>
        {(["24h", "7d", "30d"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 700,
              border: `1.5px solid ${
                period === p ? "var(--tt-green)" : "var(--app-border)"
              }`,
              background:
                period === p ? "rgba(57,178,85,0.10)" : "transparent",
              color:
                period === p ? "var(--tt-green)" : "var(--app-fg-2)",
              cursor: "pointer",
            }}
          >
            {p === "24h" ? "Laatste 24u" : p === "7d" ? "7 dagen" : "30 dagen"}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <KpiTile
          label={`Totaal spend (${period})`}
          value={`€${(totals.cost / 100).toFixed(2)}`}
        />
        <KpiTile
          label={`Runs (${period})`}
          value={String(totals.runs)}
        />
        <KpiTile
          label="Failed (24u)"
          value={String(totals.failed)}
          tone={totals.failed > 0 ? "warn" : undefined}
        />
        <KpiTile
          label="Avg cost / run"
          value={
            totals.runs === 0
              ? "—"
              : `€${(totals.cost / totals.runs / 100).toFixed(4)}`
          }
        />
      </div>

      <Sparkline timeline={timeline} />

      <Section title="Per business">
        <Table
          rows={byBusiness}
          rowKey={(r) => r.business_id}
          period={period}
          nameFor={(r) =>
            businesses.find((b) => b.id === r.business_id)?.name ?? "—"
          }
        />
      </Section>

      <Section title="Per agent">
        <Table
          rows={byAgent}
          rowKey={(r) => r.agent_id}
          period={period}
          nameFor={(r) => {
            const a = agents.find((x) => x.id === r.agent_id);
            return a ? `${a.name} · ${a.provider}` : "—";
          }}
        />
      </Section>

      <Section title="Per provider">
        <Table
          rows={byProvider}
          rowKey={(r) => r.provider}
          period={period}
          nameFor={(r) => r.provider}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        style={{
          fontFamily: "var(--hand)",
          fontSize: 20,
          fontWeight: 700,
          margin: "0 0 8px",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
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
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--app-fg-3)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: tone === "warn" ? "var(--rose)" : "var(--app-fg)",
          marginTop: 2,
          fontFamily: "var(--hand)",
          letterSpacing: "-0.5px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Table<R>({
  rows,
  rowKey,
  period,
  nameFor,
}: {
  rows: (R & {
    runs_24h: number;
    runs_7d: number;
    runs_30d: number;
    cost_24h_cents: number;
    cost_7d_cents: number;
    cost_30d_cents: number;
  })[];
  rowKey: (r: R) => string;
  period: Period;
  nameFor: (r: R) => string;
}) {
  const sorted = [...rows].sort(
    (a, b) =>
      (b[`cost_${period}_cents` as const] as number) -
      (a[`cost_${period}_cents` as const] as number),
  );
  if (sorted.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--app-fg-3)", margin: 0 }}>
        Nog geen runs.
      </p>
    );
  }
  return (
    <div
      style={{
        border: "1px solid var(--app-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {sorted.map((r) => {
        const cost = r[`cost_${period}_cents` as const] as number;
        const runsField = r[`runs_${period}` as const] as number;
        return (
          <div
            key={rowKey(r)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 100px",
              gap: 10,
              alignItems: "center",
              padding: "8px 12px",
              borderBottom: "1px solid var(--app-border-2)",
              fontSize: 12.5,
              background: "var(--app-card)",
            }}
          >
            <div style={{ fontWeight: 600 }}>{nameFor(r)}</div>
            <div style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
              {runsField} runs
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              €{(cost / 100).toFixed(4)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ timeline }: { timeline: TimelineRow[] }) {
  // Build a 30-day array filling missing days with 0 so the chart
  // doesn't bunch up on uneven activity.
  const days: { day: string; cost: number }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const match = timeline.find((t) => t.day.slice(0, 10) === iso);
    days.push({ day: iso, cost: match?.cost_cents ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.cost));
  const w = 4;
  const gap = 2;
  const totalW = days.length * (w + gap);
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
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--app-fg-3)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Spend laatste 30 dagen
      </div>
      <svg
        width="100%"
        height={56}
        viewBox={`0 0 ${totalW} 56`}
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        {days.map((d, i) => {
          const h = Math.max(2, (d.cost / max) * 50);
          return (
            <rect
              key={d.day}
              x={i * (w + gap)}
              y={56 - h}
              width={w}
              height={h}
              fill="var(--tt-green)"
              opacity={d.cost === 0 ? 0.2 : 0.85}
              rx={1}
            >
              <title>
                {d.day}: €{(d.cost / 100).toFixed(4)}
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function runsForPeriod(p: Period) {
  return (r: CostByBusinessRow) =>
    p === "24h" ? r.runs_24h : p === "7d" ? r.runs_7d : r.runs_30d;
}

function costForPeriod(p: Period) {
  return (r: CostByBusinessRow) =>
    p === "24h"
      ? r.cost_24h_cents
      : p === "7d"
        ? r.cost_7d_cents
        : r.cost_30d_cents;
}

