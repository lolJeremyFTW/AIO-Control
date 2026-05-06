// Edit popup for an existing schedule. Mirrors ScheduleBuilder's form
// but pre-filled and dispatches updateSchedule. The cron mode is
// inferred from the existing cron_expr — if it matches one of our
// presets we open in that mode; otherwise we drop into custom.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { updateSchedule } from "../app/actions/schedules";
import type { ScheduleRow } from "../lib/queries/schedules";

const DAYS = [
  { id: 0, label: "Zon" },
  { id: 1, label: "Maa" },
  { id: 2, label: "Din" },
  { id: 3, label: "Woe" },
  { id: 4, label: "Don" },
  { id: 5, label: "Vrij" },
  { id: 6, label: "Zat" },
];

type Mode = "interval" | "hourly" | "daily" | "weekly" | "custom";
type Target = { id: string; name: string };
type AgentChoice = { id: string; name: string; provider: string };

type NavNodeChoice = { id: string; name: string; depth: number };

type Props = {
  workspaceSlug: string;
  schedule: ScheduleRow;
  telegramTargets?: Target[];
  customIntegrations?: Target[];
  /** Agents in this business — used to repoint the schedule at a
   *  different agent without recreating the cron + Routine. */
  agents?: AgentChoice[];
  /** Topics / modules for this business — pins the schedule (and its
   *  run notifications) to a specific nav_node. */
  navNodes?: NavNodeChoice[];
  onClose: () => void;
};

export function EditScheduleDialog({
  workspaceSlug,
  schedule,
  telegramTargets = [],
  customIntegrations = [],
  agents = [],
  navNodes = [],
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  const initial = useMemo(() => parseCron(schedule.cron_expr ?? ""), [schedule]);

  const [title, setTitle] = useState(schedule.title ?? "");
  const [description, setDescription] = useState(schedule.description ?? "");
  const [instructions, setInstructions] = useState(schedule.instructions ?? "");
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [intervalMinutes, setIntervalMinutes] = useState(
    initial.intervalMinutes,
  );
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [days, setDays] = useState<number[]>(initial.days);
  const [customCron, setCustomCron] = useState(schedule.cron_expr ?? "");
  const [telegramTargetId, setTelegramTargetId] = useState(
    schedule.telegram_target_id ?? "",
  );
  const [customIntegrationId, setCustomIntegrationId] = useState(
    schedule.custom_integration_id ?? "",
  );
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [agentId, setAgentId] = useState(schedule.agent_id);
  const [navNodeId, setNavNodeId] = useState(schedule.nav_node_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const cronExpr = useMemo(
    () =>
      buildCron({
        mode,
        intervalMinutes,
        hour,
        minute,
        days,
        custom: customCron,
      }),
    [mode, intervalMinutes, hour, minute, days, customCron],
  );

  const submit = async () => {
    setError(null);
    setPending(true);
    const res = await updateSchedule({
      workspace_slug: workspaceSlug,
      schedule_id: schedule.id,
      patch: {
        agent_id: agentId,
        title: title || null,
        description: description || null,
        instructions: instructions || null,
        cron_expr: cronExpr,
        telegram_target_id: telegramTargetId || null,
        custom_integration_id: customIntegrationId || null,
        nav_node_id: navNodeId || null,
        enabled,
      },
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        color: "var(--app-fg)",
        padding: 0,
        width: "calc(100% - 32px)",
        maxWidth: 560,
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ padding: "22px 24px", maxHeight: "85vh", overflow: "auto" }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 26,
            fontWeight: 700,
            margin: "0 0 14px",
          }}
        >
          Schedule bewerken
        </h2>

        {agents.length > 1 && (
          <Field label="Agent (welke draait deze schedule)">
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={inp}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.provider}
                </option>
              ))}
            </select>
          </Field>
        )}

        {navNodes.length > 0 && (
          <Field label="Module / topic">
            <select
              value={navNodeId}
              onChange={(e) => setNavNodeId(e.target.value)}
              style={inp}
            >
              <option value="">— Geen (business-niveau) —</option>
              {navNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {"  ".repeat(n.depth)}
                  {n.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Titel">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inp}
          />
        </Field>
        <Field label="Beschrijving">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inp}
          />
        </Field>
        <Field label="Instructies (prompt voor de agent)">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            style={{ ...inp, resize: "vertical" }}
          />
        </Field>

        {schedule.kind === "cron" && (
          <div
            style={{
              border: "1.5px solid var(--app-border-2)",
              borderRadius: 12,
              padding: 12,
              background: "var(--app-card-2)",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>
              Wanneer?
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {(["interval", "hourly", "daily", "weekly", "custom"] as Mode[]).map(
                (m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMode(m)}
                    style={pill(mode === m)}
                  >
                    {m === "interval"
                      ? "Interval"
                      : m === "hourly"
                        ? "Elk uur"
                        : m === "daily"
                          ? "Dagelijks"
                          : m === "weekly"
                            ? "Wekelijks"
                            : "Custom"}
                  </button>
                ),
              )}
            </div>

            {mode === "interval" && (
              <select
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                style={inp}
              >
                {[5, 10, 15, 20, 30, 45, 60].map((n) => (
                  <option key={n} value={n}>
                    Elke {n} minuten
                  </option>
                ))}
              </select>
            )}

            {(mode === "daily" || mode === "weekly") && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Uur">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(Number(e.target.value))}
                    style={inp}
                  />
                </Field>
                <Field label="Minuut">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(e) => setMinute(Number(e.target.value))}
                    style={inp}
                  />
                </Field>
              </div>
            )}

            {mode === "weekly" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {DAYS.map((d) => {
                  const on = days.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setDays(
                          on
                            ? days.filter((x) => x !== d.id)
                            : [...days, d.id].sort(),
                        )
                      }
                      style={dayPill(on)}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}

            {mode === "custom" && (
              <input
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                style={{ ...inp, fontFamily: "monospace" }}
              />
            )}

            <code
              style={{
                display: "block",
                marginTop: 8,
                fontSize: 11,
                color: "var(--app-fg-3)",
              }}
            >
              {cronExpr}
            </code>
          </div>
        )}

        {(telegramTargets.length > 0 || customIntegrations.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {telegramTargets.length > 0 && (
              <Field label="Telegram channel">
                <select
                  value={telegramTargetId}
                  onChange={(e) => setTelegramTargetId(e.target.value)}
                  style={inp}
                >
                  <option value="">— Workspace default —</option>
                  {telegramTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {customIntegrations.length > 0 && (
              <Field label="Custom integration">
                <select
                  value={customIntegrationId}
                  onChange={(e) => setCustomIntegrationId(e.target.value)}
                  style={inp}
                >
                  <option value="">— Workspace default —</option>
                  {customIntegrations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}

        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 12,
            fontWeight: 600,
            margin: "8px 0 12px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ accentColor: "var(--tt-green)" }}
          />
          {enabled ? "Schedule is actief" : "Schedule is gepauzeerd"}
        </label>

        {error && (
          <p
            role="alert"
            style={{
              color: "var(--rose)",
              background: "rgba(230,82,107,0.08)",
              border: "1px solid rgba(230,82,107,0.4)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12.5,
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Annuleer
          </button>
          <button type="submit" disabled={pending} style={btnPrimary(pending)}>
            {pending ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Try to fit the existing cron expr into one of our preset modes so
// the user opens in the same editing affordance the schedule was
// created with. Anything we can't recognise drops into "custom".
function parseCron(expr: string): {
  mode: Mode;
  intervalMinutes: number;
  hour: number;
  minute: number;
  days: number[];
} {
  const def = {
    mode: "custom" as Mode,
    intervalMinutes: 30,
    hour: 9,
    minute: 0,
    days: [1, 2, 3, 4, 5],
  };
  if (!expr) return def;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return def;
  const [m, h, dom, mon, dow] = parts;
  // Interval: */N * * * *
  if (m && m.startsWith("*/") && h === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = Number(m.slice(2));
    if (!Number.isNaN(n))
      return { ...def, mode: "interval", intervalMinutes: n };
  }
  // Hourly: M * * * *
  if (m && /^\d+$/.test(m) && h === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { ...def, mode: "hourly", minute: Number(m) };
  }
  // Daily: M H * * *
  if (
    m &&
    /^\d+$/.test(m) &&
    h &&
    /^\d+$/.test(h) &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return { ...def, mode: "daily", minute: Number(m), hour: Number(h) };
  }
  // Weekly: M H * * D[,D...]
  if (
    m &&
    /^\d+$/.test(m) &&
    h &&
    /^\d+$/.test(h) &&
    dom === "*" &&
    mon === "*" &&
    dow &&
    /^[\d,]+$/.test(dow)
  ) {
    return {
      ...def,
      mode: "weekly",
      minute: Number(m),
      hour: Number(h),
      days: dow.split(",").map((x) => Number(x)),
    };
  }
  return def;
}

function buildCron(opts: {
  mode: Mode;
  intervalMinutes: number;
  hour: number;
  minute: number;
  days: number[];
  custom: string;
}): string {
  const m = opts.mode;
  if (m === "custom") return opts.custom.trim();
  if (m === "interval") return `*/${opts.intervalMinutes} * * * *`;
  if (m === "hourly") return `${opts.minute} * * * *`;
  if (m === "daily") return `${opts.minute} ${opts.hour} * * *`;
  if (m === "weekly") {
    const dows =
      opts.days.length === 0 || opts.days.length === 7
        ? "*"
        : opts.days.join(",");
    return `${opts.minute} ${opts.hour} * * ${dows}`;
  }
  return "0 9 * * *";
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "var(--type)",
};
const pill = (active: boolean): React.CSSProperties => ({
  padding: "5px 11px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 700,
  border: `1.5px solid ${active ? "var(--tt-green)" : "var(--app-border)"}`,
  background: active ? "rgba(57,178,85,0.10)" : "transparent",
  color: active ? "var(--tt-green)" : "var(--app-fg-2)",
  cursor: "pointer",
});
const dayPill = (on: boolean): React.CSSProperties => ({
  padding: "5px 9px",
  borderRadius: 8,
  fontSize: 11.5,
  fontWeight: 700,
  border: `1.5px solid ${on ? "var(--tt-green)" : "var(--app-border)"}`,
  background: on ? "var(--tt-green)" : "transparent",
  color: on ? "#fff" : "var(--app-fg-2)",
  cursor: "pointer",
});
const btnSecondary: React.CSSProperties = {
  padding: "9px 14px",
  border: "1.5px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};
const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "9px 16px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.8 : 1,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 10 }}>
      <span style={{ display: "block", marginBottom: 4, color: "var(--app-fg-2)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
