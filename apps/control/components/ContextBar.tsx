// Sticky header Row 2 — dynamic context bar.
//
// Renders KPI pills + status + actions based on the current nav level:
//   • Business level (no navNodeId): MARGE / REVENUE / KOSTEN / RUNS 24H /
//     queue badges + PauseToggle + primary CTA.
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
  /** Display names for each step in the nav path, from shallowest to deepest.
   *  Used for the compact breadcrumb shown in topic/module mode. */
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

  // Track the fetch key so stale responses from a previous navigation don't
  // overwrite data from the current one.
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
        <span className="ctx-skeleton" style={{ width: 80 }} />
        <span className="ctx-skeleton" style={{ width: 80 }} />
        <span className="ctx-skeleton" style={{ width: 80 }} />
        <span className="ctx-skeleton" style={{ width: 80 }} />
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
  const marginTone =
    margin > 0 ? "ok" : margin < 0 ? "bad" : ("neutral" as const);

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
      {/* KPI pills — all link to the overview tab */}
      <Link href={base} className="ctx-pill ctx-pill-link">
        <span className="ctx-pill-label">MARGE</span>
        <span className={`ctx-pill-value ctx-tone-${marginTone}`}>
          {fmtEur(margin)}
        </span>
      </Link>

      <span className="ctx-divider" />

      <Link href={base} className="ctx-pill ctx-pill-link">
        <span className="ctx-pill-label">REVENUE</span>
        <span className="ctx-pill-value">{fmtEur(data.revenue_30d_eur)}</span>
      </Link>

      <Link href={base} className="ctx-pill ctx-pill-link">
        <span className="ctx-pill-label">KOSTEN</span>
        <span className="ctx-pill-value">
          {fmtEur(data.usage_30d_eur)}
          {spendLimit != null && (
            <span className="ctx-spend-limit">
              /{fmtEur(spendLimit)}{" "}
              <span
                className={
                  spendPct != null && spendPct > 80
                    ? "ctx-tone-bad"
                    : "ctx-tone-neutral"
                }
              >
                {spendPct}%
              </span>
            </span>
          )}
        </span>
      </Link>

      <span className="ctx-divider" />

      {/* RUNS 24H → schedules tab */}
      <Link href={`${base}/schedules`} className="ctx-pill ctx-pill-link">
        <span className="ctx-pill-label">RUNS 24H</span>
        <span className="ctx-pill-value">{data.runs_24h}</span>
      </Link>

      {/* Queue badges */}
      {data.queue_auto > 0 && (
        <Link href={base} className="ctx-queue-badge ctx-queue-auto">
          <span className="ctx-queue-dot" />
          auto-publish {data.queue_auto}
        </Link>
      )}
      {data.queue_review > 0 && (
        <Link href={base} className="ctx-queue-badge ctx-queue-review">
          <span className="ctx-queue-dot" />
          review {data.queue_review}
        </Link>
      )}

      <div className="ctx-grow" />

      {/* Status + pause */}
      <PauseToggle
        workspaceSlug={workspaceSlug}
        businessId={biz.id}
        status={biz.status}
      />

      {/* Primary CTA */}
      <Link
        href={`${base}/agents`}
        className="ctx-cta"
      >
        + {biz.primary_action ?? "Nieuwe automatie"}
      </Link>
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
  // Show last 2 levels of the breadcrumb as "Parent › Current"
  const crumb =
    navBreadcrumb && navBreadcrumb.length > 0
      ? navBreadcrumb.slice(-2).join(" › ")
      : null;

  return (
    <div className="ctx-bar">
      {crumb && (
        <>
          <span className="ctx-breadcrumb-mini">{crumb}</span>
          <span className="ctx-divider" />
        </>
      )}

      <Link href={base} className="ctx-pill ctx-pill-link">
        <span className="ctx-pill-label">KOSTEN 30D</span>
        <span className="ctx-pill-value">{fmtEur(data.cost_30d_eur)}</span>
      </Link>

      <Link href={`${base}/schedules`} className="ctx-pill ctx-pill-link">
        <span className="ctx-pill-label">RUNS 24H</span>
        <span className="ctx-pill-value">{data.runs_24h}</span>
      </Link>

      {data.queue_auto > 0 && (
        <Link href={base} className="ctx-queue-badge ctx-queue-auto">
          <span className="ctx-queue-dot" />
          auto {data.queue_auto}
        </Link>
      )}
      {data.queue_review > 0 && (
        <Link href={base} className="ctx-queue-badge ctx-queue-review">
          <span className="ctx-queue-dot" />
          review {data.queue_review}
        </Link>
      )}

      <div className="ctx-grow" />

      <Link href={`${base}/agents`} className="ctx-cta ctx-cta-secondary">
        + Nieuw agent
      </Link>
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
