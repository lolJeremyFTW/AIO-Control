// Business detail dashboard — KPI ring, recent runs, agents summary,
// open queue snapshot, recent activity from audit_logs. Server
// component — pure markup; mutations live in the dedicated tabs.

import Link from "next/link";

import type { AgentRow } from "../lib/queries/agents";
import type { BusinessRow, KpiRow, QueueRow } from "../lib/queries/businesses";
import type { RunRow } from "../lib/queries/schedules";
import { QueueGrid } from "./QueueGrid";

type Props = {
  workspaceSlug: string;
  business: BusinessRow;
  kpis: KpiRow[];
  queue: QueueRow[];
  agents: AgentRow[];
  runs: RunRow[];
};

const fmtEur = (n: number) =>
  n.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

export function BusinessDashboard({
  workspaceSlug,
  business,
  kpis,
  queue,
  agents,
  runs,
}: Props) {
  const k30 = kpis.find((k) => k.period === "30D");
  const k7 = kpis.find((k) => k.period === "7D");
  const k24 = kpis.find((k) => k.period === "24H");

  const margin = (k30?.revenue_eur ?? 0) - (k30?.usage_eur ?? 0);
  const successfulRuns = runs.filter((r) => r.status === "done").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Top-line KPIs */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        <KpiTile
          label="MARGE 30D"
          value={fmtEur(margin)}
          tone={margin > 0 ? "ok" : margin < 0 ? "bad" : "neutral"}
        />
        <KpiTile label="REVENUE 30D" value={fmtEur(k30?.revenue_eur ?? 0)} />
        <KpiTile label="AI KOSTEN 30D" value={fmtEur(k30?.usage_eur ?? 0)} />
        <KpiTile
          label="REVENUE 7D"
          value={fmtEur(k7?.revenue_eur ?? 0)}
        />
        <KpiTile
          label="RUNS 24U"
          value={String(k24?.runs_count ?? 0)}
          tone="neutral"
        />
        <KpiTile
          label="SUCCESS / FAIL"
          value={`${successfulRuns} / ${failedRuns}`}
          tone={failedRuns > 0 ? "warn" : "neutral"}
        />
      </section>

      {/* Two-column layout: queue snapshot left, agents + runs right */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
          gap: 18,
        }}
      >
        <section>
          <SectionHeader
            title="Open queue"
            cta={
              queue.length > 0
                ? {
                    label: "Bekijk alles",
                    href: `/${workspaceSlug}/business/${business.id}`,
                  }
                : undefined
            }
          />
          {queue.length === 0 ? (
            <EmptyState
              title="Wachtrij leeg ✓"
              body="Geen items te reviewen. Trigger een run of wacht tot een agent iets oppakt."
            />
          ) : (
            <QueueGrid items={queue.slice(0, 6)} workspaceSlug={workspaceSlug} />
          )}
        </section>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section>
            <SectionHeader
              title={`Agents · ${agents.length}`}
              cta={{
                label: "Beheer",
                href: `/${workspaceSlug}/business/${business.id}/agents`,
              }}
            />
            {agents.length === 0 ? (
              <EmptyState
                title="Geen agents"
                body="Voeg een agent toe om runs te starten."
                slim
              />
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
                {agents.slice(0, 5).map((a) => (
                  <li
                    key={a.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 10px",
                      border: "1px solid var(--app-border-2)",
                      borderRadius: 10,
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{a.name}</span>
                    <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                      {a.provider}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader
              title="Recente runs"
              cta={{
                label: "History",
                href: `/${workspaceSlug}/business/${business.id}/schedules`,
              }}
            />
            {runs.length === 0 ? (
              <EmptyState
                title="Nog geen runs"
                body="Trigger een agent via Run-now of een webhook."
                slim
              />
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
                {runs.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "8px 1fr auto",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      border: "1px solid var(--app-border-2)",
                      borderRadius: 10,
                      fontSize: 12.5,
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
                      {r.triggered_by} · {r.status}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--app-fg-3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(r.created_at).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "warn" | "neutral";
}) {
  const colour =
    tone === "ok"
      ? "var(--tt-green)"
      : tone === "bad"
        ? "var(--rose)"
        : tone === "warn"
          ? "var(--amber)"
          : "var(--app-fg)";
  return (
    <div
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: "14px 16px",
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
          fontSize: 22,
          fontWeight: 700,
          color: colour,
          marginTop: 4,
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
        marginBottom: 10,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--hand)",
          fontSize: 22,
          fontWeight: 700,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {cta && (
        <Link
          href={cta.href}
          style={{ fontSize: 11.5, color: "var(--tt-green)", fontWeight: 700 }}
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  slim = false,
}: {
  title: string;
  body: string;
  slim?: boolean;
}) {
  return (
    <div
      style={{
        padding: slim ? "16px 14px" : "28px 22px",
        border: "1.5px dashed var(--app-border)",
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--hand)",
          fontWeight: 700,
          fontSize: slim ? 16 : 22,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--app-fg-3)",
          margin: "6px 0 0",
        }}
      >
        {body}
      </p>
    </div>
  );
}
