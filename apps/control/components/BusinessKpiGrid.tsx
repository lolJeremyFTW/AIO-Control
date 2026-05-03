// Per-business overview tiles for the workspace dashboard. Each card shows
// 30D revenue, 30D AI cost, the resulting margin, and 24h run count.
// Margin is the headline number — that's what the operator actually cares
// about: "is this mini-business profitable after AI spend?"
//
// Uses next/link so basePath gets prepended on the path-version build
// (BASE_PATH=/aio). Raw <a href="/foo"> would land at the domain root and
// produce a 404 there.

import Link from "next/link";

import type { BusinessRow } from "../lib/queries/businesses";
import { getDict } from "../lib/i18n/server";

type Summary = {
  revenue_30d: number;
  usage_30d: number;
  revenue_7d: number;
  runs_24h: number;
};

type Props = {
  workspaceSlug: string;
  businesses: BusinessRow[];
  summaries: Map<string, Summary>;
};

const fmtEur = (n: number) =>
  n.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

export async function BusinessKpiGrid({
  workspaceSlug,
  businesses,
  summaries,
}: Props) {
  const { t } = await getDict();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
        marginBottom: 22,
      }}
    >
      {businesses.map((b) => {
        const s = summaries.get(b.id) ?? {
          revenue_30d: 0,
          usage_30d: 0,
          revenue_7d: 0,
          runs_24h: 0,
        };
        const margin = s.revenue_30d - s.usage_30d;
        const positive = margin > 0;
        return (
          <Link
            key={b.id}
            href={`/${workspaceSlug}/business/${b.id}`}
            style={{
              border: "1.5px solid var(--app-border)",
              borderRadius: 14,
              padding: 14,
              background: "var(--app-card)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              color: "var(--app-fg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                className={`node ${b.variant}`}
                style={{ ["--size" as string]: "32px", fontSize: 12 }}
              >
                {b.letter}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {b.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                  {b.sub ?? ""}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <Tile label={t("kpi.margin")} value={fmtEur(margin)} tone={positive ? "ok" : margin < 0 ? "bad" : "neutral"} />
              <Tile label={t("kpi.revenue")} value={fmtEur(s.revenue_30d)} tone="neutral" />
              <Tile label={t("kpi.cost")} value={fmtEur(s.usage_30d)} tone="neutral" />
            </div>

            <div
              style={{
                fontSize: 11,
                color: "var(--app-fg-3)",
                marginTop: 4,
              }}
            >
              {t("kpi.runs24h", { count: s.runs_24h })}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "bad" | "neutral";
}) {
  const colour =
    tone === "ok"
      ? "var(--tt-green)"
      : tone === "bad"
        ? "var(--rose)"
        : "var(--app-fg)";
  return (
    <div style={{ minWidth: 0 }}>
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
          fontSize: 14,
          fontWeight: 700,
          color: colour,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}
