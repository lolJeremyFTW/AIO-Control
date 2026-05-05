// Sticky header Row 2 — dynamic context bar.
//
// Renders KPI columns + status + actions based on the current nav level:
//   • Business level (no navNodeId): MARGE / REVENUE / KOSTEN / RUNS 24H /
//     queue badges + PauseToggle + primary split CTA.
//   • Topic/module level (with navNodeId): breadcrumb + KOSTEN / RUNS 24H /
//     queue badge + CTA.
//
// Data flow:
//   Static business metadata (status, primary_action, spend limit) → props
//   KPI numbers (revenue, runs, queue) → fetched client-side from /api/context-bar

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { PauseToggle } from "./PauseToggle";

// ── Types ──────────────────────────────────────────────────────────────────

type BizMeta = {
  id: string;
  status: "running" | "paused";
  primary_action: string | null;
  daily_spend_limit_cents: number | null;
};

type BusinessData = {
  type: "business";
  revenue_30d_eur: number;
  usage_30d_eur: number;
  runs_24h: number;
  queue_auto: number;
  queue_review: number;
};

type TopicData = {
  type: "topic";
  cost_30d_eur: number;
  runs_24h: number;
  queue_review: number;
  queue_auto: number;
};

type ContextData = BusinessData | TopicData | null;

export type Props = {
  workspaceSlug: string;
  biz: BizMeta;
  /** ID of the deepest nav_node in the current path (undefined = business root). */
  navNodeId?: string;
  /** Display names for each step in the nav path, from shallowest to deepest. */
  navBreadcrumb?: string[];
};

// ── Main component ─────────────────────────────────────────────────────────

export function ContextBar({
  workspaceSlug,
  biz,
  navNodeId,
  navBreadcrumb,
}: Props) {
  const [data, setData] = useState<ContextData>(null);
  const [loading, setLoading] = useState(true);

  const fetchKey = `${biz.id}::${navNodeId ?? ""}`;
  const keyRef = useRef(fetchKey);
  keyRef.current = fetchKey;

  useEffect(() => {
    setLoading(true);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const url = navNodeId
      ? `${base}/api/context-bar?bizId=${biz.id}&nodeId=${navNodeId}`
      : `${base}/api/context-bar?bizId=${biz.id}`;
    const key = fetchKey;

    fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: ContextData) => {
        if (keyRef.current === key) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (keyRef.current === key) setLoading(false);
      });
    // fetchKey intentionally not in deps array — we derive it from the two
    // values above and use keyRef for stale-response guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz.id, navNodeId]);

  const base = `/${workspaceSlug}/business/${biz.id}`;

  if (loading && !data) {
    return (
      <div className="ctx-bar">
        <span className="ctx-skeleton" style={{ width: 60 }} />
        <span className="ctx-skeleton" style={{ width: 60 }} />
        <span className="ctx-skeleton" style={{ width: 60 }} />
        <span className="ctx-skeleton" style={{ width: 60 }} />
      </div>
    );
  }

  if (!data) return null;

  if (data.type === "topic") {
    return (
      <TopicBar
        data={data}
        base={base}
        navBreadcrumb={navBreadcrumb}
        workspaceSlug={workspaceSlug}
      />
    );
  }

  return (
    <BusinessBar
      data={data}
      biz={biz}
      base={base}
      workspaceSlug={workspaceSlug}
    />
  );
}

// ── Business bar ───────────────────────────────────────────────────────────

function BusinessBar({
  data,
  biz,
  base,
  workspaceSlug,
}: {
  data: BusinessData;
  biz: BizMeta;
  base: string;
  workspaceSlug: string;
}) {
  const margin = data.revenue_30d_eur - data.usage_30d_eur;
  const marginColor =
    margin > 0
      ? "var(--tt-green)"
      : margin < 0
        ? "var(--rose)"
        : undefined;

  const spendLimit =
    biz.daily_spend_limit_cents != null
      ? biz.daily_spend_limit_cents / 100
      : null;
  const spendPct =
    spendLimit && spendLimit > 0
      ? Math.round((data.usage_30d_eur / spendLimit) * 100)
      : null;

  return (
    <div className="ctx-bar">
      {/* KPI vertical stacks */}
      <div className="kpis">
        <Link href={base} className="kpi" style={{ textDecoration: "none" }}>
          <span className="lbl">Marge</span>
          <span className="val" style={{ color: marginColor }}>
            {fmtEur(margin)}
          </span>
        </Link>

        <Link href={base} className="kpi" style={{ textDecoration: "none" }}>
          <span className="lbl">Revenue</span>
          <span className="val">{fmtEur(data.revenue_30d_eur)}</span>
        </Link>

        <Link href={base} className="kpi" style={{ textDecoration: "none" }}>
          <span className="lbl">Kosten</span>
          <span className="val">
            {fmtEur(data.usage_30d_eur)}
            {spendLimit != null && (
              <span className="unit">/{fmtEur(spendLimit)}</span>
            )}
            {spendPct != null && (
              <span className={spendPct > 80 ? "delta down" : "unit"}>
                {spendPct}%
              </span>
            )}
          </span>
        </Link>

        <span className="vrule" />

        <Link
          href={`${base}/schedules`}
          className="kpi"
          style={{ textDecoration: "none" }}
        >
          <span className="lbl">Runs 24h</span>
          <span className="val">{data.runs_24h}</span>
        </Link>
      </div>

      {/* Queue badges */}
      {data.queue_auto > 0 && (
        <Link
          href={base}
          className="auto-status"
          style={{ textDecoration: "none" }}
        >
          <span className="d" />
          auto {data.queue_auto}
        </Link>
      )}
      {data.queue_review > 0 && (
        <Link
          href={base}
          className="hitl"
          style={{ textDecoration: "none" }}
        >
          <span className="num">{data.queue_review}</span>
          review
        </Link>
      )}

      <div className="grow" />

      {/* Status + pause */}
      <PauseToggle
        workspaceSlug={workspaceSlug}
        businessId={biz.id}
        status={biz.status}
      />

      {/* Primary CTA — split button */}
      <div className="pbtn-split">
        <Link
          href={`${base}/agents`}
          className="main"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          + {biz.primary_action ?? "Nieuwe automatie"}
        </Link>
        <span className="caret">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

// ── Topic / module bar ─────────────────────────────────────────────────────

function TopicBar({
  data,
  base,
  navBreadcrumb,
}: {
  data: TopicData;
  base: string;
  navBreadcrumb?: string[];
  workspaceSlug: string;
}) {
  const crumb =
    navBreadcrumb && navBreadcrumb.length > 0
      ? navBreadcrumb.slice(-2).join(" › ")
      : null;

  return (
    <div className="ctx-bar">
      {crumb && (
        <>
          <span className="ctx-breadcrumb-mini">{crumb}</span>
          <span className="vrule" />
        </>
      )}

      <div className="kpis">
        <Link href={base} className="kpi" style={{ textDecoration: "none" }}>
          <span className="lbl">Kosten 30d</span>
          <span className="val">{fmtEur(data.cost_30d_eur)}</span>
        </Link>

        <Link
          href={`${base}/schedules`}
          className="kpi"
          style={{ textDecoration: "none" }}
        >
          <span className="lbl">Runs 24h</span>
          <span className="val">{data.runs_24h}</span>
        </Link>
      </div>

      {data.queue_auto > 0 && (
        <Link
          href={base}
          className="auto-status"
          style={{ textDecoration: "none" }}
        >
          <span className="d" />
          auto {data.queue_auto}
        </Link>
      )}
      {data.queue_review > 0 && (
        <Link
          href={base}
          className="hitl"
          style={{ textDecoration: "none" }}
        >
          <span className="num">{data.queue_review}</span>
          review
        </Link>
      )}

      <div className="grow" />

      <div
        className="pbtn-split"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-card-2)",
          color: "var(--app-fg)",
        }}
      >
        <Link
          href={`${base}/agents`}
          className="main"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          + Nieuw agent
        </Link>
        <span
          className="caret"
          style={{ borderColor: "rgba(255,255,255,0.12)" }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  n.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
