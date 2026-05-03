// Header weather chip — clickable, opens a 10-day forecast dropdown.
// The chip itself shows the same compact "city · date · temp" the
// header always had; click → fetches the daily forecast via the
// loadForecast server action and renders a small table below.

"use client";

import { useEffect, useRef, useState } from "react";

import { CloudIcon, getAppIcon } from "@aio/ui/icon";

import { loadForecast } from "../app/actions/weather";

export type WeatherChipProps = {
  workspaceId: string;
  initial: { city: string; date: string; temp: string };
};

type ForecastDay = {
  date: string;
  weekday: string;
  short: string;
  tempMin: string;
  tempMax: string;
  summary: string;
  icon:
    | "weather-sun"
    | "weather-partly"
    | "weather-cloud"
    | "weather-rain"
    | "weather-snow"
    | "weather-fog"
    | "weather-storm";
};

export function WeatherChip({ workspaceId, initial }: WeatherChipProps) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<ForecastDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside dismiss.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  // Lazy-load on first open. Cached after that.
  useEffect(() => {
    if (!open || days || loading) return;
    setLoading(true);
    setError(null);
    void loadForecast({ workspace_id: workspaceId })
      .then((res) => {
        if (res.ok) setDays(res.data as ForecastDay[]);
        else setError(res.error);
      })
      .finally(() => setLoading(false));
  }, [open, days, loading, workspaceId]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen((o) => !o)}
        title="Klik voor 10-daagse voorspelling"
      >
        <CloudIcon />
        <span>
          <strong>{initial.city}</strong> · {initial.date}
        </span>
        <span className="temp">{initial.temp}</span>
      </button>

      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            background: "var(--app-card)",
            border: "1.5px solid var(--app-border)",
            borderRadius: 14,
            boxShadow:
              "0 24px 60px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(57,178,85,0.08)",
            zIndex: 60,
            overflow: "hidden",
            fontFamily: "var(--type)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px 10px",
              borderBottom: "1px solid var(--app-border-2)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--app-fg-3)",
                fontWeight: 700,
              }}
            >
              {initial.city} · 10 dagen
            </span>
            <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
              open-meteo
            </span>
          </div>

          {loading && (
            <p
              style={{
                fontSize: 12,
                color: "var(--app-fg-3)",
                padding: 16,
                margin: 0,
              }}
            >
              Forecast laden…
            </p>
          )}
          {error && (
            <p
              role="alert"
              style={{
                fontSize: 12,
                color: "var(--rose)",
                padding: 16,
                margin: 0,
              }}
            >
              {error}
            </p>
          )}
          {days && days.length === 0 && !loading && !error && (
            <p
              style={{
                fontSize: 12,
                color: "var(--app-fg-3)",
                padding: 16,
                margin: 0,
              }}
            >
              Forecast onbeschikbaar.
            </p>
          )}
          {days && days.length > 0 && (
            <div style={{ padding: 4 }}>
              {days.map((d, i) => (
                <div
                  key={d.date}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 22px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 10px",
                    borderRadius: 8,
                    background:
                      i === 0
                        ? "rgba(57,178,85,0.06)"
                        : "transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-fg-2)",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {i === 0 ? "Vandaag" : d.weekday}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--app-fg-2)",
                    }}
                  >
                    {getAppIcon(d.icon, 18) ?? null}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--app-fg-3)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={d.short}
                  >
                    {d.summary}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--app-fg)",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: "var(--app-fg-3)", marginRight: 6 }}>
                      {d.tempMin}
                    </span>
                    {d.tempMax}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
