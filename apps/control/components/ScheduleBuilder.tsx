// Inline schedule builder à la Claude: title + description +
// instructions + timing (interval/hourly/daily/weekly/custom-cron) +
// optional Telegram target + custom integration. Replaces the old
// "+ Cron" toggle inside SchedulesPanel.
//
// Translates the structured timing form into a cron expression that
// gets fed into Anthropic's Routines API. Custom-mode lets advanced
// users hand-write the expression.

"use client";

import { useMemo, useState, useTransition } from "react";

import type { AgentRow } from "../lib/queries/agents";
import { createCronSchedule } from "../app/actions/schedules";

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

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  agents: AgentRow[];
  triggerOrigin: string;
  telegramTargets: Target[];
  customIntegrations: Target[];
  onCreated?: () => void;
};

export function ScheduleBuilder({
  workspaceSlug,
  workspaceId,
  businessId,
  agents,
  triggerOrigin,
  telegramTargets,
  customIntegrations,
  onCreated,
}: Props) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const [mode, setMode] = useState<Mode>("daily");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [customCron, setCustomCron] = useState("0 9 * * *");
  const [telegramTargetId, setTelegramTargetId] = useState<string>("");
  const [customIntegrationId, setCustomIntegrationId] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const explanation = useMemo(
    () => explainCron(cronExpr, mode, intervalMinutes, hour, minute, days),
    [cronExpr, mode, intervalMinutes, hour, minute, days],
  );

  const submit = () => {
    if (!agentId) return setError("Kies eerst een agent.");
    if (!title.trim()) return setError("Geef de schedule een titel.");
    if (!instructions.trim())
      return setError("Voeg instructies toe — wat moet de agent doen?");
    setError(null);
    setInfo(null);
    startTransition(async () => {
      // Pass the origin only — the action picks the right callback
      // path based on whether the agent is subscription-Claude
      // (Anthropic Routines + payload-callback) or local cron.
      const res = await createCronSchedule({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        agent_id: agentId,
        business_id: businessId,
        cron_expr: cronExpr,
        prompt: instructions,
        callback_origin: triggerOrigin,
        title,
        description: description || null,
        instructions,
        telegram_target_id: telegramTargetId || null,
        custom_integration_id: customIntegrationId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(`Schedule "${title}" aangemaakt.`);
      setTitle("");
      setDescription("");
      setInstructions("");
      onCreated?.();
    });
  };

  return (
    <div
      style={{
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: 18,
        background: "var(--app-card)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>
        <h3
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 4px",
          }}
        >
          Nieuwe schedule
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--app-fg-3)", margin: 0 }}>
          Definieer wanneer en wat de agent moet doen. Reports gaan naar
          Telegram of een custom webhook als je die instelt.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Agent">
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
        <Field label="Titel">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bijv. Dagelijkse Etsy listing scan"
            style={inp}
          />
        </Field>
      </div>

      <Field label="Beschrijving (optioneel — voor jezelf)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Wat doet deze schedule en waarom"
          style={inp}
        />
      </Field>

      <Field label="Instructies — wat moet de agent doen?">
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={5}
          placeholder={`Bijv.\n• Scan de top-30 Etsy listings in de tag "personalized journal"\n• Vergelijk titels en prijzen met onze 5 actieve listings\n• Genereer 3 nieuwe titel/prijs voorstellen + log redenering`}
          style={{ ...inp, resize: "vertical", fontFamily: "var(--type)" }}
        />
      </Field>

      {/* ── Timing ───────────────────────────────────────────── */}
      <div
        style={{
          border: "1.5px solid var(--app-border-2)",
          borderRadius: 12,
          padding: 14,
          background: "var(--app-card-2)",
        }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 10 }}>
          Wanneer?
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {(["interval", "hourly", "daily", "weekly", "custom"] as Mode[]).map(
            (m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 700,
                  border: `1.5px solid ${
                    mode === m ? "var(--tt-green)" : "var(--app-border)"
                  }`,
                  background:
                    mode === m
                      ? "rgba(57,178,85,0.10)"
                      : "transparent",
                  color: mode === m ? "var(--tt-green)" : "var(--app-fg-2)",
                  cursor: "pointer",
                }}
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
          <Field label="Elke X minuten">
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
          </Field>
        )}

        {mode === "hourly" && (
          <Field label="Op welke minuut elk uur">
            <input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) =>
                setMinute(
                  Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                )
              }
              style={inp}
            />
          </Field>
        )}

        {(mode === "daily" || mode === "weekly") && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Uur (0–23)">
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) =>
                  setHour(
                    Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                  )
                }
                style={inp}
              />
            </Field>
            <Field label="Minuut (0–59)">
              <input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) =>
                  setMinute(
                    Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                  )
                }
                style={inp}
              />
            </Field>
          </div>
        )}

        {mode === "weekly" && (
          <Field label="Op welke dagen">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      border: `1.5px solid ${
                        on ? "var(--tt-green)" : "var(--app-border)"
                      }`,
                      background: on ? "var(--tt-green)" : "transparent",
                      color: on ? "#fff" : "var(--app-fg-2)",
                      cursor: "pointer",
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {mode === "custom" && (
          <Field label="Cron-expressie (5 velden — min uur dagm maand dagw)">
            <input
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              placeholder="0 9 * * *"
              style={{ ...inp, fontFamily: "monospace" }}
            />
          </Field>
        )}

        <div
          style={{
            marginTop: 10,
            fontSize: 11.5,
            color: "var(--app-fg-3)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{explanation}</span>
          <code
            style={{
              padding: "2px 8px",
              background: "var(--app-card)",
              borderRadius: 6,
              border: "1px solid var(--app-border-2)",
              fontSize: 10.5,
            }}
          >
            {cronExpr}
          </code>
        </div>
      </div>

      {/* ── Reporting targets ────────────────────────────────── */}
      {(telegramTargets.length > 0 || customIntegrations.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {telegramTargets.length > 0 && (
            <Field label="Telegram channel (optioneel)">
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
            <Field label="Custom integration (optioneel)">
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

      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}
      {info && (
        <p style={{ color: "var(--tt-green)", fontSize: 12, margin: 0 }}>
          {info}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !agentId || !title.trim()}
          style={{
            padding: "10px 18px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Aanmaken…" : "Schedule aanmaken"}
        </button>
      </div>
    </div>
  );
}

/** Build a 5-field cron expression from the structured form state. */
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

function explainCron(
  expr: string,
  mode: Mode,
  intervalMinutes: number,
  hour: number,
  minute: number,
  days: number[],
): string {
  if (mode === "interval") return `Elke ${intervalMinutes} minuten.`;
  if (mode === "hourly")
    return `Elk uur, op minuut ${pad(minute)}.`;
  if (mode === "daily")
    return `Dagelijks om ${pad(hour)}:${pad(minute)}.`;
  if (mode === "weekly") {
    if (days.length === 0) return "Geen dagen geselecteerd.";
    const labels = days.map((d) => DAYS[d]?.label ?? "?").join(", ");
    return `Op ${labels} om ${pad(hour)}:${pad(minute)}.`;
  }
  return `Custom: ${expr}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 13,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
      <span
        style={{
          display: "block",
          marginBottom: 4,
          color: "var(--app-fg-2)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
