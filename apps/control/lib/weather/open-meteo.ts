// Server-side weather fetcher. Open-Meteo is free + key-less. We cache
// each (lat,lon) response for 10 minutes via Next's fetch cache —
// current temperature doesn't move faster than that.
//
// Workspaces store their preferred coords + city; getWeather(workspaceId)
// reads them and falls back to Breda when unset. Per-workspace was the
// right call: a multi-workspace operator working in NL + DE shouldn't
// see Breda's temperature in their German workspace.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type Weather = { city: string; date: string; temp: string };

const DEFAULT_CITY = process.env.WEATHER_CITY ?? "Breda";
const DEFAULT_LAT = Number(process.env.WEATHER_LATITUDE ?? "51.589");
const DEFAULT_LON = Number(process.env.WEATHER_LONGITUDE ?? "4.776");

export async function getWeather(workspaceId?: string): Promise<Weather> {
  let lat = DEFAULT_LAT;
  let lon = DEFAULT_LON;
  let city = DEFAULT_CITY;

  if (workspaceId) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("workspaces")
        .select("weather_city, weather_lat, weather_lon")
        .eq("id", workspaceId)
        .maybeSingle();
      if (data) {
        const r = data as {
          weather_city: string;
          weather_lat: number;
          weather_lon: number;
        };
        city = r.weather_city || city;
        lat = Number(r.weather_lat ?? lat);
        lon = Number(r.weather_lon ?? lon);
      }
    } catch {
      /* fall through to default */
    }
  }

  const fallback: Weather = { city, date: "—", temp: "—" };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
    `&longitude=${lon}&current=temperature_2m&timezone=Europe%2FAmsterdam`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; time?: string };
    };
    const temp = data.current?.temperature_2m;
    const iso = data.current?.time;
    return {
      city,
      date: iso ? formatDate(iso) : fallback.date,
      temp: typeof temp === "number" ? `${Math.round(temp)}°` : fallback.temp,
    };
  } catch {
    return fallback;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}
