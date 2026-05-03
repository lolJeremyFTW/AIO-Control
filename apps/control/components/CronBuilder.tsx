// Friendlier cron-expression input. Most users don't read cron, so the
// default mode is a day picker + time picker that emits "<min> <hr> * *
// <days>". Power users can flip to "gevorderd" to type the raw expression
// directly. Both modes write to the same `value` upstream so the parent
// stays cron-only and doesn't have to know which mode produced it.

"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  /** Current cron expression (5 fields). */
  value: string;
  onChange: (cron: string) => void;
};

const DAYS: { id: string; label: string; idx: number }[] = [
  { id: "MON", label: "Ma", idx: 1 },
  { id: "TUE", label: "Di", idx: 2 },
  { id: "WED", label: "Wo", idx: 3 },
  { id: "THU", label: "Do", idx: 4 },
  { id: "FRI", label: "Vr", idx: 5 },
  { id: "SAT", label: "Za", idx: 6 },
  { id: "SUN", label: "Zo", idx: 0 },
];

type Parsed = {
  minute: number;
  hour: number;
  days: Set<string>;
};

export function CronBuilder({ value, onChange }: Props) {
  // Try to interpret the incoming cron expression as something the simple
  // mode can edit. If it fits the "<min> <hr> * * <days>" template we
  // open in simple mode; otherwise we open in advanced mode and don't
  // touch the user's expression.
  const initialParsed = useMemo(() => parseSimple(value), [value]);
  const [mode, setMode] = useState<"simple" | "advanced">(
    initialParsed ? "simple" : "advanced",
  );

  const [time, setTime] = useState<string>(
    initialParsed
      ? `${pad(initialParsed.hour)}:${pad(initialParsed.minute)}`
      : "09:00",
  );
  const [days, setDays] = useState<Set<string>>(
    initialParsed ? initialParsed.days : new Set(DAYS.map((d) => d.id)),
  );

  // Re-emit cron whenever simple-mode picks change.
  useEffect(() => {
    if (mode !== "simple") return;
    const cron = buildSimple(time, days);
    if (cron && cron !== value) onChange(cron);
    // We intentionally exclude `value` from deps to avoid feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, time, days]);

  const toggleDay = (id: string) => {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allDays = days.size === 7;
  const summary = useMemo(() => {
    if (mode === "advanced") return "Cron-expressie";
    if (days.size === 0) return "Geen dagen geselecteerd";
    if (allDays) return `Elke dag om ${time}`;
    if (days.size === 5 && !days.has("SAT") && !days.has("SUN"))
      return `Elke werkdag om ${time}`;
    if (days.size === 2 && days.has("SAT") && days.has("SUN"))
      return `In het weekend om ${time}`;
    const names = DAYS.filter((d) => days.has(d.id))
      .map((d) => d.label.toLowerCase())
      .join(", ");
    return `${names} om ${time}`;
  }, [mode, days, allDays, time]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            color: "var(--app-fg-3)",
            fontWeight: 600,
          }}
        >
          {summary}
        </span>
        <div
          role="tablist"
          style={{
            display: "inline-flex",
            border: "1.5px solid var(--app-border)",
            borderRadius: 8,
            background: "var(--app-card-2)",
            overflow: "hidden",
          }}
        >
          {(["simple", "advanced"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 700,
                background: mode === m ? "var(--tt-green)" : "transparent",
                color: mode === m ? "#fff" : "var(--app-fg-2)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {m === "simple" ? "Simpel" : "Gevorderd"}
            </button>
          ))}
        </div>
      </div>

      {mode === "simple" ? (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <button
              type="button"
              onClick={() =>
                setDays((prev) =>
                  prev.size === 7
                    ? new Set()
                    : new Set(DAYS.map((d) => d.id)),
                )
              }
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 700,
                border: "1.5px dashed var(--app-border)",
                background: "transparent",
                color: "var(--app-fg-3)",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {allDays ? "geen" : "alle"}
            </button>
            {DAYS.map((d) => {
              const on = days.has(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  aria-pressed={on}
                  style={{
                    padding: "5px 12px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    border: `1.5px solid ${on ? "var(--tt-green)" : "var(--app-border)"}`,
                    background: on
                      ? "rgba(57,178,85,0.12)"
                      : "transparent",
                    color: on ? "var(--tt-green)" : "var(--app-fg-2)",
                    borderRadius: 999,
                    cursor: "pointer",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            <span style={{ display: "block", marginBottom: 4 }}>Tijd</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              step={60}
              style={{
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg)",
                padding: "8px 11px",
                borderRadius: 9,
                fontFamily: "var(--type)",
                fontSize: 13.5,
                width: 140,
              }}
            />
          </label>
          <p
            style={{
              fontSize: 10.5,
              color: "var(--app-fg-3)",
              margin: 0,
            }}
          >
            Tijd in UTC ·{" "}
            <code style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
              {value || "—"}
            </code>{" "}
            · Wil je meerdere tijden per dag? Maak meerdere schedules aan.
          </p>
        </>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0 9 * * MON-FRI"
          style={{
            width: "100%",
            background: "var(--app-card-2)",
            border: "1.5px solid var(--app-border)",
            color: "var(--app-fg)",
            padding: "9px 11px",
            borderRadius: 9,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 13,
          }}
        />
      )}
    </div>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildSimple(time: string, days: Set<string>): string | null {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (days.size === 0) return null;
  const dayPart =
    days.size === 7
      ? "*"
      : DAYS.filter((d) => days.has(d.id))
          .map((d) => d.id)
          .join(",");
  return `${m} ${h} * * ${dayPart}`;
}

function parseSimple(expr: string): Parsed | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*") return null;

  const m = Number(min);
  const h = Number(hr);
  if (!Number.isFinite(m) || !Number.isFinite(h)) return null;
  if (m < 0 || m > 59 || h < 0 || h > 23) return null;

  const days = new Set<string>();
  if (dow === "*") {
    for (const d of DAYS) days.add(d.id);
  } else {
    const tokens = (dow ?? "").split(",");
    const knownIds = new Set(DAYS.map((d) => d.id));
    for (const tok of tokens) {
      const t = tok.trim().toUpperCase();
      // Range like MON-FRI: expand it.
      if (t.includes("-")) {
        const [aStr, bStr] = t.split("-");
        const a = DAYS.find((d) => d.id === aStr);
        const b = DAYS.find((d) => d.id === bStr);
        if (!a || !b) return null;
        // Walk from a through b in week order (handle wrap).
        const order = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai === -1 || bi === -1) return null;
        if (ai <= bi) {
          for (let i = ai; i <= bi; i++) days.add(order[i]!);
        } else {
          for (let i = ai; i < order.length; i++) days.add(order[i]!);
          for (let i = 0; i <= bi; i++) days.add(order[i]!);
        }
        continue;
      }
      if (!knownIds.has(t)) return null;
      days.add(t);
    }
  }

  return { minute: m, hour: h, days };
}
