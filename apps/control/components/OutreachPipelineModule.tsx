"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  runOutreachPipelineNow,
  updateOutreachPipelineConfig,
} from "../app/actions/outreach-pipeline";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { OUTREACH_PIPELINE_STAGES } from "../lib/outreach/pipeline-stages";

type Config = {
  id: string;
  enabled: boolean;
  interval_seconds: number;
  batch_size: number;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
  total_cycles: number;
  total_outreached_count: number;
  total_duplicate_skipped: number;
};

type RunRow = {
  id: string;
  status: string;
  claimed_count: number;
  outreached_count: number;
  duplicate_skipped_count: number;
  error_count: number;
  started_at: string;
  ended_at: string | null;
};

type EventRow = {
  id: number;
  run_id: string | null;
  stage: string;
  agent_name: string;
  event_type: "ping" | "done" | "skip" | "error" | "metric" | "qa";
  message: string | null;
  delta_outreached: number;
  created_at: string;
};

type Stats = {
  total: number;
  eligible: number;
  moduleOutreached: number;
  sent: number;
  pendingWhatsapp: number;
  failedQa24h: number;
};

type Props = {
  workspaceSlug: string;
  businessSlug: string;
  workspaceId: string;
  businessId: string;
  config: Config | null;
  stats: Stats;
  recentRuns: RunRow[];
  recentEvents: EventRow[];
};

export function OutreachPipelineModule({
  workspaceSlug,
  businessSlug,
  workspaceId,
  businessId,
  config: initialConfig,
  stats,
  recentRuns,
  recentEvents,
}: Props) {
  const [config, setConfig] = useState<Config | null>(initialConfig);
  const [events, setEvents] = useState<EventRow[]>(recentEvents);
  const [runs] = useState<RunRow[]>(recentRuns);
  const [intervalSeconds, setIntervalSeconds] = useState(
    initialConfig?.interval_seconds ?? 10,
  );
  const [batchSize, setBatchSize] = useState(initialConfig?.batch_size ?? 3);
  const [outreached, setOutreached] = useState(stats.moduleOutreached);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setConfig(initialConfig);
    setIntervalSeconds(initialConfig?.interval_seconds ?? 10);
    setBatchSize(initialConfig?.batch_size ?? 3);
  }, [initialConfig]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`outreach-pipeline-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "aio_control",
          table: "outreach_pipeline_events",
          filter: `business_id=eq.${businessId}`,
        },
        (payload: { new: EventRow }) => {
          const event = payload.new;
          setEvents((prev) => [event, ...prev].slice(0, 80));
          if (event.delta_outreached > 0) {
            setOutreached((value) => value + event.delta_outreached);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "aio_control",
          table: "outreach_pipeline_configs",
          filter: `business_id=eq.${businessId}`,
        },
        (payload: { new: Config }) => {
          setConfig(payload.new);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId]);

  const latestByStage = useMemo(() => {
    const map = new Map<string, EventRow>();
    for (const event of events) {
      if (!map.has(event.stage)) map.set(event.stage, event);
    }
    return map;
  }, [events]);

  const running = config?.enabled ?? false;
  const lastRun = runs[0] ?? null;

  const save = (patch?: { enabled?: boolean }) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await updateOutreachPipelineConfig({
        workspace_slug: workspaceSlug,
        business_slug: businessSlug,
        workspace_id: workspaceId,
        business_id: businessId,
        enabled: patch?.enabled ?? config?.enabled ?? false,
        interval_seconds: intervalSeconds,
        batch_size: batchSize,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo("Pipeline opgeslagen.");
    });
  };

  const runNow = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await runOutreachPipelineNow({
        workspace_slug: workspaceSlug,
        business_slug: businessSlug,
        workspace_id: workspaceId,
        business_id: businessId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(
        `Cycle klaar: ${res.data.outreached} geoutreached, ${res.data.duplicates} duplicate skips, ${res.data.errors} errors.`,
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        @keyframes pipelinePulse {
          0% { box-shadow: 0 0 0 0 rgba(57,178,85,.34); }
          70% { box-shadow: 0 0 0 9px rgba(57,178,85,0); }
          100% { box-shadow: 0 0 0 0 rgba(57,178,85,0); }
        }
        @keyframes pipelineFlow {
          from { transform: translateX(-28px); opacity: .2; }
          to { transform: translateX(28px); opacity: .8; }
        }
      `}</style>

      <section style={panelStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={titleStyle}>Silent outreach pipeline</h2>
            <p style={subStyle}>
              Draait naast cron jobs. Schrijft alleen visuele events en telt
              duplicate-safe outreach in Supabase.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => save({ enabled: !running })}
              style={running ? dangerButtonStyle(pending) : primaryButtonStyle(pending)}
            >
              {running ? "Pauzeer loop" : "Start loop"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={runNow}
              style={secondaryButtonStyle(pending)}
            >
              Run fast cycle
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 10,
            marginTop: 16,
          }}
        >
          <Metric label="Module outreach" value={outreached} accent="#39b255" />
          <Metric label="Eligible now" value={stats.eligible} />
          <Metric label="Alle leads" value={stats.total} />
          <Metric label="Sent" value={stats.sent} />
          <Metric label="WA klaar" value={stats.pendingWhatsapp} />
          <Metric label="QA errors 24h" value={stats.failedQa24h} accent="#c44d4d" />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px 160px 1fr",
            gap: 10,
            alignItems: "end",
            marginTop: 14,
          }}
        >
          <Field label="Loop interval">
            <input
              type="number"
              min={5}
              max={3600}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Batch size">
            <input
              type="number"
              min={1}
              max={25}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => save()}
              style={secondaryButtonStyle(pending)}
            >
              Opslaan
            </button>
            <span style={subStyle}>
              Status:{" "}
              <strong style={{ color: running ? "#2f9347" : "var(--app-fg-3)" }}>
                {running ? "running" : "paused"}
              </strong>
              {config?.last_finished_at
                ? ` · laatste cycle ${timeAgo(config.last_finished_at)}`
                : ""}
            </span>
          </div>
        </div>

        {info && <p style={infoStyle}>{info}</p>}
        {error && <p style={errorStyle}>{error}</p>}
        {config?.last_error && !error && (
          <p style={errorStyle}>Laatste error: {config.last_error}</p>
        )}
      </section>

      <section style={panelStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h2 style={titleStyle}>Agent pings</h2>
          {lastRun && (
            <span style={subStyle}>
              Laatste run: {lastRun.status} · {lastRun.outreached_count} outreach
            </span>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {OUTREACH_PIPELINE_STAGES.map((stage, index) => {
            const event = latestByStage.get(stage.key);
            const status = event?.event_type ?? "skip";
            const active =
              event &&
              Date.now() - new Date(event.created_at).getTime() < 9000 &&
              event.event_type !== "skip";
            return (
              <div key={stage.key} style={agentNodeStyle(status, !!active)}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={nodeIndexStyle}>{String(index + 1).padStart(2, "0")}</span>
                  <span style={nodeStatusStyle(status)}>{status}</span>
                </div>
                <strong style={{ fontSize: 13 }}>{stage.agent}</strong>
                <span style={{ color: "var(--app-fg-3)", fontSize: 11.5 }}>
                  {stage.label}
                </span>
                {event?.message && (
                  <span
                    style={{
                      color: "var(--app-fg-2)",
                      fontSize: 11,
                      lineHeight: 1.35,
                      marginTop: 4,
                    }}
                  >
                    {event.message.length > 74
                      ? `${event.message.slice(0, 73)}...`
                      : event.message}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div
          aria-hidden
          style={{
            position: "relative",
            height: 6,
            marginTop: 14,
            overflow: "hidden",
            borderRadius: 99,
            background: "var(--app-card-2)",
            border: "1px solid var(--app-border-2)",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: "1px auto 1px 50%",
              width: 60,
              borderRadius: 99,
              background: "#39b255",
              animation: running
                ? "pipelineFlow 1.1s ease-in-out infinite alternate"
                : "none",
            }}
          />
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={titleStyle}>Live event stream</h2>
        {events.length === 0 ? (
          <p style={{ ...subStyle, marginTop: 8 }}>
            Nog geen pipeline events. Start de loop of run een fast cycle.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {events.slice(0, 18).map((event) => (
              <div key={event.id} style={eventRowStyle(event.event_type)}>
                <span style={eventDotStyle(event.event_type)} />
                <strong style={{ minWidth: 132, fontSize: 12 }}>
                  {event.agent_name}
                </strong>
                <span style={{ flex: 1, color: "var(--app-fg-2)", fontSize: 12 }}>
                  {event.message ?? event.event_type}
                </span>
                {event.delta_outreached > 0 && (
                  <span style={deltaStyle}>+{event.delta_outreached}</span>
                )}
                <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                  {timeAgo(event.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div style={metricStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <strong style={{ fontSize: 24, color: accent ?? "var(--app-fg)" }}>
        {value}
      </strong>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11.5, fontWeight: 700 }}>
      <span style={{ color: "var(--app-fg-3)", display: "block", marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "net nu";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}u`;
  return `${Math.floor(h / 24)}d`;
}

const panelStyle: React.CSSProperties = {
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card)",
  borderRadius: 12,
  padding: 16,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--hand)",
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
};

const subStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--app-fg-3)",
  margin: "4px 0 0",
  lineHeight: 1.45,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 13,
};

const metricStyle: React.CSSProperties = {
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
  borderRadius: 8,
  padding: "10px 12px",
  minHeight: 72,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--app-fg-3)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontWeight: 800,
};

const infoStyle: React.CSSProperties = {
  color: "#2f9347",
  fontSize: 12.5,
  margin: "10px 0 0",
};

const errorStyle: React.CSSProperties = {
  color: "var(--rose)",
  background: "rgba(230,82,107,0.08)",
  border: "1px solid rgba(230,82,107,0.35)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  margin: "10px 0 0",
};

function primaryButtonStyle(pending: boolean): React.CSSProperties {
  return buttonBase("var(--tt-green)", "#fff", "var(--tt-green)", pending);
}

function secondaryButtonStyle(pending: boolean): React.CSSProperties {
  return buttonBase("var(--app-card-2)", "var(--app-fg)", "var(--app-border)", pending);
}

function dangerButtonStyle(pending: boolean): React.CSSProperties {
  return buttonBase("rgba(196,77,77,.1)", "var(--rose)", "rgba(196,77,77,.35)", pending);
}

function buttonBase(
  background: string,
  color: string,
  borderColor: string,
  pending: boolean,
): React.CSSProperties {
  return {
    padding: "8px 13px",
    border: `1.5px solid ${borderColor}`,
    background,
    color,
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 12.5,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.68 : 1,
  };
}

function agentNodeStyle(
  status: EventRow["event_type"] | "skip",
  active: boolean,
): React.CSSProperties {
  const color = statusColor(status);
  return {
    border: `1.5px solid ${active ? color : "var(--app-border-2)"}`,
    background:
      status === "error"
        ? "rgba(196,77,77,.06)"
        : active
          ? "rgba(57,178,85,.07)"
          : "var(--app-card-2)",
    borderRadius: 8,
    padding: 12,
    minHeight: 122,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    animation: active ? "pipelinePulse 1.25s ease-out infinite" : "none",
  };
}

const nodeIndexStyle: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".08em",
};

function nodeStatusStyle(status: EventRow["event_type"] | "skip"): React.CSSProperties {
  const color = statusColor(status);
  return {
    color,
    border: `1px solid ${color}`,
    borderRadius: 999,
    padding: "1px 6px",
    fontSize: 9.5,
    fontWeight: 900,
    textTransform: "uppercase",
  };
}

function eventRowStyle(status: EventRow["event_type"]): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border: "1px solid var(--app-border-2)",
    background:
      status === "error" ? "rgba(196,77,77,.05)" : "var(--app-card-2)",
    borderRadius: 8,
    padding: "8px 10px",
  };
}

function eventDotStyle(status: EventRow["event_type"]): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: 99,
    background: statusColor(status),
    flexShrink: 0,
  };
}

const deltaStyle: React.CSSProperties = {
  color: "#2f9347",
  border: "1px solid rgba(57,178,85,.35)",
  background: "rgba(57,178,85,.08)",
  borderRadius: 999,
  padding: "1px 7px",
  fontSize: 11,
  fontWeight: 900,
};

function statusColor(status: EventRow["event_type"] | "skip"): string {
  if (status === "error") return "#c44d4d";
  if (status === "qa") return "#7c5cbf";
  if (status === "metric" || status === "done") return "#39b255";
  if (status === "ping") return "#d4752a";
  return "var(--app-fg-3)";
}
