// Workspace-wide agents dashboard. Three sections:
//   1. KPI strip: agents / routines / runs / cost / revenue (stub)
//   2. Calendar (day / week / month view) of scheduled cron + webhook
//      routines + recently-fired manual runs.
//   3. Per-business revenue + cost cards (revenue is a placeholder
//      until Stripe / Mollie webhooks are wired).
// The agents-grouped-per-business list still renders below this
// dashboard from the parent page.

"use client";

import { useEffect, useMemo, useState } from "react";

import { translate } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";

type ScheduleLite = {
  id: string;
  agent_id: string;
  business_id: string | null;
  kind: "cron" | "webhook" | "manual";
  cron_expr: string | null;
  enabled: boolean;
  title: string | null;
};

type RunLite = {
  id: string;
  agent_id: string;
  business_id: string | null;
  schedule_id: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  cost_cents: number;
  created_at: string;
};

type AgentLite = {
  id: string;
  name: string;
  business_id: string | null;
};

type BusinessLite = {
  id: string;
  name: string;
  letter: string;
  variant: string;
  color_hex?: string | null;
};

type Props = {
  workspaceSlug: string;
  agents: AgentLite[];
  businesses: BusinessLite[];
  schedules: ScheduleLite[];
  /** Recent runs across the workspace (last 200) — used for cost
   *  totals + the calendar's "fired" markers. */
  runs: RunLite[];
};

type ViewMode = "day" | "week" | "month";

export function AgentsDashboard({
  workspaceSlug,
  agents,
  businesses,
  schedules,
  runs,
}: Props) {
  const locale = useLocale();
  // Renamed to `tr` to avoid shadowing by the time-variable `t` used
  // in the calendar `for (const t of fires)` loop below.
  const tr = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  // The toLocale*() format strings used by the calendar pull from
  // the active i18n locale (nl-NL / en-US / de-DE) so day initials
  // and time formats follow the user's language.
  const intlLocale =
    locale === "en" ? "en-US" : locale === "de" ? "de-DE" : "nl-NL";
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  // Hydration guard: the SSR pass and the first CSR pass run on
  // different wall-clocks (React error #418). We render a stable
  // empty dashboard on the server and only flip to real content
  // once we're definitely client-side.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // ── KPI rollups ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const enabledRoutines = schedules.filter(
      (s) => s.enabled && (s.kind === "cron" || s.kind === "webhook"),
    ).length;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const runsToday = runs.filter(
      (r) => new Date(r.created_at).getTime() >= startOfDay.getTime(),
    ).length;
    const cost30Cents = runs
      .filter((r) => new Date(r.created_at).getTime() >= since30)
      .reduce((acc, r) => acc + (r.cost_cents ?? 0), 0);
    return {
      agents: agents.length,
      routines: enabledRoutines,
      runsToday,
      cost30Cents,
    };
  }, [agents, schedules, runs]);

  // ── Per-business revenue + cost cards ───────────────────────
  const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const perBiz = businesses.map((b) => {
    const bizCost = runs
      .filter(
        (r) =>
          r.business_id === b.id &&
          new Date(r.created_at).getTime() >= since30,
      )
      .reduce((acc, r) => acc + (r.cost_cents ?? 0), 0);
    const bizRunsToday = runs.filter(
      (r) =>
        r.business_id === b.id &&
        new Date(r.created_at).getTime() >=
          new Date().setHours(0, 0, 0, 0),
    ).length;
    return { biz: b, costCents: bizCost, runsToday: bizRunsToday };
  });

  // ── Calendar buckets — day/week/month ───────────────────────
  // For each cron schedule we pre-compute fire times in the visible
  // window, then bucket by day. Webhook schedules don't have a
  // predictable schedule so we don't surface them on the calendar
  // (only the routines count badge tracks them).
  const window = useMemo(
    () => buildWindow(view, anchor, intlLocale),
    [view, anchor, intlLocale],
  );

  const fireMap = useMemo(() => {
    const map = new Map<string, ScheduleFire[]>();
    for (const day of window.days) {
      map.set(dayKey(day), []);
    }
    for (const s of schedules) {
      if (s.kind !== "cron" || !s.enabled || !s.cron_expr) continue;
      const fires = computeFires(s.cron_expr, window.start, window.end);
      const agent = agents.find((a) => a.id === s.agent_id);
      const biz = s.business_id
        ? businesses.find((b) => b.id === s.business_id) ?? null
        : null;
      for (const t of fires) {
        const key = dayKey(t);
        if (!map.has(key)) continue;
        map.get(key)!.push({
          time: t,
          schedule: s,
          agentName: agent?.name ?? tr("dash.unknownAgent"),
          biz,
        });
      }
    }
    // Also overlay actual past runs in the visible window so the
    // user sees what has already fired.
    for (const r of runs) {
      const at = new Date(r.created_at);
      if (at < window.start || at > window.end) continue;
      const key = dayKey(at);
      if (!map.has(key)) continue;
      const agent = agents.find((a) => a.id === r.agent_id);
      const biz = r.business_id
        ? businesses.find((b) => b.id === r.business_id) ?? null
        : null;
      map.get(key)!.push({
        time: at,
        run: r,
        agentName: agent?.name ?? tr("dash.unknownAgent"),
        biz,
      });
    }
    // Sort each bucket by time.
    for (const arr of map.values()) {
      arr.sort((a, b) => a.time.getTime() - b.time.getTime());
    }
    return map;
  }, [window, schedules, runs, agents, businesses]);

  const shiftAnchor = (delta: number) => {
    const d = new Date(anchor);
    if (view === "day") d.setDate(d.getDate() + delta);
    else if (view === "week") d.setDate(d.getDate() + delta * 7);
    else if (view === "month") d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  };

  // Render a tiny skeleton on the SSR pass + the very first CSR
  // pass so the wall-clock-dependent calendar HTML can't disagree
  // between the two — once the post-mount effect has run we swap
  // in the real dashboard.
  if (!hydrated) {
    return (
      <div
        suppressHydrationWarning
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          minHeight: 320,
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── KPI strip ───────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
        }}
      >
        <Kpi label={tr("dash.kpi.agents")} value={String(stats.agents)} />
        <Kpi
          label={tr("dash.kpi.activeRoutines")}
          value={String(stats.routines)}
          accent={stats.routines > 0 ? "tt-green" : undefined}
        />
        <Kpi
          label={tr("dash.kpi.runsToday")}
          value={String(stats.runsToday)}
          accent={stats.runsToday > 0 ? "tt-green" : undefined}
        />
        <Kpi
          label={tr("dash.kpi.cost30d")}
          value={`€${(stats.cost30Cents / 100).toFixed(2)}`}
        />
        <Kpi label={tr("dash.kpi.revenue30d")} value="—" sub="Stripe/Mollie ↗" />
      </div>

      {/* ── Calendar ────────────────────────────────────────── */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{tr("dash.calendar")}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => shiftAnchor(-1)}
            >
              ←
            </button>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: "var(--app-fg)",
                minWidth: 200,
                textAlign: "center",
              }}
            >
              {window.label}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => shiftAnchor(1)}
            >
              →
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setAnchor(new Date())}
            >
              {tr("dash.today")}
            </button>
            <div
              style={{
                display: "inline-flex",
                gap: 2,
                padding: 3,
                background: "var(--app-card-2)",
                border: "1px solid var(--app-border)",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              {(["day", "week", "month"] as const).map((m) => {
                const active = view === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setView(m)}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "none",
                      cursor: "pointer",
                      background: active
                        ? "var(--tt-green)"
                        : "transparent",
                      color: active ? "#fff" : "var(--app-fg-2)",
                      fontFamily: "var(--type)",
                      fontWeight: 700,
                    }}
                  >
                    {m === "day"
                      ? tr("dash.day")
                      : m === "week"
                        ? tr("dash.week")
                        : tr("dash.month")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {view === "day" && (
          <DayView
            day={anchor}
            fires={fireMap.get(dayKey(anchor)) ?? []}
            intlLocale={intlLocale}
            tr={tr}
          />
        )}
        {view === "week" && (
          <WeekView
            days={window.days}
            fireMap={fireMap}
            intlLocale={intlLocale}
            tr={tr}
          />
        )}
        {view === "month" && (
          <MonthView
            anchor={anchor}
            days={window.days}
            fireMap={fireMap}
            intlLocale={intlLocale}
            tr={tr}
          />
        )}
      </div>

      {/* ── Per-business revenue/cost ───────────────────────── */}
      <div className="card">
        <h3>{tr("dash.perBusiness.title")}</h3>
        <p className="desc">{tr("dash.perBusiness.desc")}</p>
        {perBiz.length === 0 ? (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--app-fg-3)",
              fontStyle: "italic",
              padding: "16px 0",
            }}
          >
            {tr("dash.perBusiness.empty")}
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {perBiz.map((p) => (
              <a
                key={p.biz.id}
                href={`/${workspaceSlug}/business/${p.biz.id}`}
                style={{
                  display: "block",
                  padding: 14,
                  border: "1.5px solid var(--app-border)",
                  borderRadius: 12,
                  background: "var(--app-card-2)",
                  color: "var(--app-fg)",
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background:
                        p.biz.color_hex ??
                        `var(--${p.biz.variant}, var(--tt-green))`,
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {p.biz.letter}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {p.biz.name}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    fontSize: 11.5,
                  }}
                >
                  <div>
                    <div style={{ color: "var(--app-fg-3)" }}>
                      {tr("dash.perBusiness.revenue")}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--app-fg-3)",
                      }}
                      title="Geen revenue tracking nog"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--app-fg-3)" }}>
                      {tr("dash.perBusiness.aiCost")}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      €{(p.costCents / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    marginTop: 8,
                  }}
                >
                  {tr("dash.perBusiness.runsToday", { count: p.runsToday })}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar primitives ─────────────────────────────────────

type ScheduleFire = {
  time: Date;
  agentName: string;
  biz: BusinessLite | null;
  schedule?: ScheduleLite;
  run?: RunLite;
};

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "tt-green";
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        border: "1.5px solid var(--app-border)",
        borderRadius: 12,
        background: "var(--app-card)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--app-fg-3)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: accent === "tt-green" ? "var(--tt-green)" : "var(--app-fg)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10.5,
            color: "var(--app-fg-3)",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

type Tr = (key: string, vars?: Record<string, string | number>) => string;

function DayView({
  day,
  fires,
  intlLocale,
  tr,
}: {
  day: Date;
  fires: ScheduleFire[];
  intlLocale: string;
  tr: Tr;
}) {
  // Hour rail with chips per fire.
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr",
        gap: 0,
        border: "1px solid var(--app-border-2)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {hours.map((h) => {
        const inHour = fires.filter((f) => f.time.getHours() === h);
        return (
          <DayHourRow
            key={h}
            hour={h}
            fires={inHour}
            intlLocale={intlLocale}
            tr={tr}
          />
        );
      })}
      {/* Re-render the day prop in a hidden span so React doesn't
          accidentally drop the key set when day shifts. */}
      <span style={{ display: "none" }}>{day.toISOString()}</span>
    </div>
  );
}

function DayHourRow({
  hour,
  fires,
  intlLocale,
  tr,
}: {
  hour: number;
  fires: ScheduleFire[];
  intlLocale: string;
  tr: Tr;
}) {
  return (
    <>
      <div
        style={{
          padding: "10px 8px",
          fontSize: 11,
          color: "var(--app-fg-3)",
          fontFamily: "ui-monospace, Menlo, monospace",
          borderTop: "1px solid var(--app-border-2)",
          borderRight: "1px solid var(--app-border-2)",
          background: "var(--app-card-2)",
          textAlign: "right",
        }}
      >
        {hour.toString().padStart(2, "0")}:00
      </div>
      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid var(--app-border-2)",
          minHeight: 40,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {fires.map((f, i) => (
          <FireChip key={i} fire={f} intlLocale={intlLocale} tr={tr} />
        ))}
      </div>
    </>
  );
}

function WeekView({
  days,
  fireMap,
  intlLocale,
  tr,
}: {
  days: Date[];
  fireMap: Map<string, ScheduleFire[]>;
  intlLocale: string;
  tr: Tr;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 0,
        border: "1px solid var(--app-border-2)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {days.map((d, i) => {
        const fires = fireMap.get(dayKey(d)) ?? [];
        const isToday = isSameDay(d, new Date());
        return (
          <div
            key={i}
            style={{
              borderRight:
                i < 6 ? "1px solid var(--app-border-2)" : undefined,
              padding: 8,
              minHeight: 220,
              background: isToday
                ? "rgba(57,178,85,0.04)"
                : "var(--app-card)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: isToday ? "var(--tt-green)" : "var(--app-fg-3)",
                marginBottom: 8,
              }}
            >
              {d
                .toLocaleDateString(intlLocale, { weekday: "short" })
                .replace(".", "")}{" "}
              {d.getDate()}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {fires.length === 0 ? (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    fontStyle: "italic",
                  }}
                >
                  {tr("dash.cell.empty")}
                </span>
              ) : (
                fires.map((f, j) => (
                  <FireChip
                    key={j}
                    fire={f}
                    compact
                    intlLocale={intlLocale}
                    tr={tr}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  anchor,
  days,
  fireMap,
  intlLocale,
  tr,
}: {
  anchor: Date;
  days: Date[];
  fireMap: Map<string, ScheduleFire[]>;
  intlLocale: string;
  tr: Tr;
}) {
  // Day-of-week headers using the active locale. We start at a known
  // Monday (1970-01-05 was a Monday) and walk 7 days, so the labels
  // come out in the user's language.
  const monday = new Date(Date.UTC(1970, 0, 5));
  const dayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d
      .toLocaleDateString(intlLocale, { weekday: "short", timeZone: "UTC" })
      .replace(".", "");
  });
  return (
    <div
      style={{
        border: "1px solid var(--app-border-2)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          background: "var(--app-card-2)",
        }}
      >
        {dayHeaders.map((h) => (
          <div
            key={h}
            style={{
              padding: "8px 10px",
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--app-fg-3)",
              borderRight: "1px solid var(--app-border-2)",
            }}
          >
            {h}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
        }}
      >
        {days.map((d, i) => {
          const fires = fireMap.get(dayKey(d)) ?? [];
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = isSameDay(d, new Date());
          return (
            <div
              key={i}
              style={{
                borderTop: "1px solid var(--app-border-2)",
                borderRight:
                  i % 7 < 6 ? "1px solid var(--app-border-2)" : undefined,
                padding: 6,
                minHeight: 92,
                background: !inMonth
                  ? "var(--app-card-2)"
                  : isToday
                    ? "rgba(57,178,85,0.04)"
                    : "var(--app-card)",
                opacity: inMonth ? 1 : 0.55,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isToday ? "var(--tt-green)" : "var(--app-fg-2)",
                  marginBottom: 4,
                }}
              >
                {d.getDate()}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {fires.slice(0, 3).map((f, j) => (
                  <FireChip
                    key={j}
                    fire={f}
                    compact
                    intlLocale={intlLocale}
                    tr={tr}
                  />
                ))}
                {fires.length > 3 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--app-fg-3)",
                      fontWeight: 700,
                    }}
                  >
                    +{fires.length - 3}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FireChip({
  fire,
  compact,
  intlLocale,
  // tr unused inside the chip currently — kept on the prop list so
  // callers don't have to drop it; will surface as the run-status
  // label gets translated next pass.
  tr: _tr,
}: {
  fire: ScheduleFire;
  compact?: boolean;
  intlLocale: string;
  tr: Tr;
}) {
  const isPast = !!fire.run;
  const dotColor = fire.run
    ? fire.run.status === "done"
      ? "var(--tt-green)"
      : fire.run.status === "failed"
        ? "var(--rose)"
        : "var(--amber)"
    : fire.biz?.color_hex ??
      `var(--${fire.biz?.variant ?? "tt-green"}, var(--tt-green))`;
  return (
    <span
      title={`${fire.time.toLocaleTimeString(intlLocale, {
        hour: "2-digit",
        minute: "2-digit",
      })} · ${fire.agentName}${fire.biz ? ` · ${fire.biz.name}` : ""}${
        fire.run ? ` · ${fire.run.status}` : ""
      }`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: compact ? "2px 6px" : "4px 8px",
        background: isPast
          ? "var(--app-card-2)"
          : "rgba(57,178,85,0.06)",
        border: `1px solid ${
          isPast ? "var(--app-border-2)" : "var(--tt-green)"
        }`,
        borderRadius: 6,
        fontSize: compact ? 10.5 : 11.5,
        fontWeight: 600,
        color: "var(--app-fg-2)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: compact ? 10 : 11,
          color: "var(--app-fg-3)",
        }}
      >
        {fire.time.toLocaleTimeString(intlLocale, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {fire.agentName}
      </span>
    </span>
  );
}

// ─── Date helpers ────────────────────────────────────────────

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildWindow(
  view: ViewMode,
  anchor: Date,
  intlLocale: string = "nl-NL",
): { start: Date; end: Date; days: Date[]; label: string } {
  if (view === "day") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      start,
      end,
      days: [start],
      label: anchor.toLocaleDateString(intlLocale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    };
  }
  if (view === "week") {
    // ISO week — Monday as start.
    const start = new Date(anchor);
    const offset = (start.getDay() + 6) % 7; // 0..6, Mon=0
    start.setDate(start.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const last = days[6]!;
    return {
      start,
      end,
      days,
      label: `${start.toLocaleDateString(intlLocale, { day: "numeric", month: "short" })} – ${last.toLocaleDateString(intlLocale, { day: "numeric", month: "short", year: "numeric" })}`,
    };
  }
  // month
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const start = new Date(monthStart);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  // 6 rows × 7 cols = 42 cells (covers any month).
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return {
    start,
    end: monthEnd,
    days,
    label: anchor.toLocaleDateString(intlLocale, {
      month: "long",
      year: "numeric",
    }),
  };
}

// Cron fire-time computation. Same 5-field parser the local cron
// scheduler uses; we walk minute-by-minute through the window and
// keep matching minutes. Caps at 500 fires per schedule to keep a
// month view with */1 * * * * (every minute) from blowing up.
function computeFires(expr: string, start: Date, end: Date): Date[] {
  const fires: Date[] = [];
  if (!expr || end <= start) return fires;
  const cur = new Date(start);
  cur.setSeconds(0, 0);
  // Round up to next minute boundary to avoid double-firing on
  // start-of-window minute.
  cur.setMinutes(cur.getMinutes() + 1);
  let safety = 60 * 24 * 35; // ~5 weeks of minutes max
  while (cur < end && fires.length < 500 && safety-- > 0) {
    if (matchesCron(expr, cur)) fires.push(new Date(cur));
    cur.setMinutes(cur.getMinutes() + 1);
  }
  return fires;
}

function matchesCron(expr: string, d: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hr, dom, mon, dow] = parts;
  return (
    matchField(min!, d.getMinutes(), 0, 59) &&
    matchField(hr!, d.getHours(), 0, 23) &&
    matchField(dom!, d.getDate(), 1, 31) &&
    matchField(mon!, d.getMonth() + 1, 1, 12) &&
    matchField(dow!, d.getDay(), 0, 6)
  );
}

function matchField(
  field: string,
  value: number,
  min: number,
  max: number,
): boolean {
  if (field === "*") return true;
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [base, stepStr] = part.split("/");
      const step = Number(stepStr);
      if (!Number.isFinite(step) || step <= 0) continue;
      const baseRange = base === "*" ? `${min}-${max}` : base!;
      const [a, b] = parseRange(baseRange, min, max);
      if (a === null || b === null) continue;
      for (let n = a; n <= b; n += step) if (n === value) return true;
      continue;
    }
    if (part.includes("-")) {
      const [a, b] = parseRange(part, min, max);
      if (a === null || b === null) continue;
      if (value >= a && value <= b) return true;
      continue;
    }
    const n = Number(part);
    if (Number.isFinite(n) && n === value) return true;
  }
  return false;
}

function parseRange(
  s: string,
  min: number,
  max: number,
): [number | null, number | null] {
  const [aStr, bStr] = s.split("-");
  const a = aStr === "*" ? min : Number(aStr);
  const b = bStr === undefined ? a : bStr === "*" ? max : Number(bStr);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [null, null];
  return [a, b];
}
