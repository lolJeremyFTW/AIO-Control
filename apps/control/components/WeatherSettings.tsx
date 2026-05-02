// Per-workspace weather location form. Type a city name → server-side
// geocoder resolves to (lat, lon) → preview the result → save.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  geocodeCity,
  updateWorkspaceWeather,
} from "../app/actions/workspace-settings";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initial: { city: string; lat: number; lon: number };
};

export function WeatherSettings({ workspaceSlug, workspaceId, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [city, setCity] = useState(initial.city);
  const [lat, setLat] = useState<number>(initial.lat);
  const [lon, setLon] = useState<number>(initial.lon);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = () =>
    startTransition(async () => {
      setError(null);
      setHint("Zoeken…");
      const res = await geocodeCity(city);
      if (!res.ok) {
        setError(res.error);
        setHint(null);
        return;
      }
      setLat(res.data.lat);
      setLon(res.data.lon);
      setHint(`${res.data.name}, ${res.data.country} → ${res.data.lat.toFixed(3)}, ${res.data.lon.toFixed(3)}`);
    });

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await updateWorkspaceWeather({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        city,
        lat,
        lon,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHint(`Opgeslagen — header ververst.`);
      router.refresh();
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12, color: "var(--app-fg-3)", margin: 0 }}>
        De header-chip toont de live temperatuur (Open-Meteo, geen API
        key nodig). Locatie is per workspace zodat je in een tweede
        workspace andere coördinaten kunt zetten.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Stad"
          style={{ ...input, flex: 1, minWidth: 120 }}
        />
        <button
          onClick={lookup}
          disabled={pending}
          style={btnSecondary(pending)}
        >
          {pending ? "…" : "Zoek coördinaten"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={lbl}>
          <span style={lblText}>Lat</span>
          <input
            type="number"
            step={0.001}
            value={lat}
            onChange={(e) => setLat(Number(e.target.value))}
            style={{ ...input, width: 110 }}
          />
        </label>
        <label style={lbl}>
          <span style={lblText}>Lon</span>
          <input
            type="number"
            step={0.001}
            value={lon}
            onChange={(e) => setLon(Number(e.target.value))}
            style={{ ...input, width: 110 }}
          />
        </label>
        <button
          onClick={save}
          disabled={pending || !city.trim()}
          style={{
            ...btnPrimary(pending),
            alignSelf: "flex-end",
          }}
        >
          Opslaan
        </button>
      </div>
      {hint && (
        <p style={{ fontSize: 12, color: "var(--app-fg-3)", margin: 0 }}>
          {hint}
        </p>
      )}
      {error && (
        <p
          role="alert"
          style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 9,
  fontSize: 13,
};

const lbl: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--app-fg-2)",
};

const lblText: React.CSSProperties = { display: "block", marginBottom: 3 };

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

const btnSecondary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});
