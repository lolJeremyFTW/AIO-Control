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

// ─── 10-day forecast (used by the header weather dropdown) ──────────
//
// Returns one entry per day for the next 10 days at the workspace's
// configured location. Open-Meteo gives us min/max temp + a WMO
// weather_code per day; we surface the code as a friendly label so
// the UI doesn't need to ship a code-table.

export type ForecastDay = {
  date: string;        // ISO date, e.g. "2026-05-04"
  weekday: string;     // localized 3-letter, e.g. "Ma"
  short: string;       // localized "4 mei"
  tempMin: string;     // "8°"
  tempMax: string;     // "16°"
  /** Friendly summary derived from the WMO weather_code. */
  summary: string;
  /** Icon name from the AppIcon registry the UI can render via
   *  getAppIcon. Plain SVG, never an emoji. */
  icon:
    | "weather-sun"
    | "weather-partly"
    | "weather-cloud"
    | "weather-rain"
    | "weather-snow"
    | "weather-fog"
    | "weather-storm";
};

export async function getWeatherForecast(
  workspaceId?: string,
): Promise<ForecastDay[]> {
  let lat = DEFAULT_LAT;
  let lon = DEFAULT_LON;

  if (workspaceId) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("workspaces")
        .select("weather_lat, weather_lon")
        .eq("id", workspaceId)
        .maybeSingle();
      if (data) {
        const r = data as { weather_lat: number; weather_lon: number };
        lat = Number(r.weather_lat ?? lat);
        lon = Number(r.weather_lon ?? lon);
      }
    } catch {
      /* fall through */
    }
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
    `&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=Europe%2FAmsterdam&forecast_days=10`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        weather_code?: number[];
      };
    };
    const d = json.daily;
    if (!d?.time) return [];
    return d.time.map((iso, i) => {
      const code = d.weather_code?.[i] ?? 0;
      const max = d.temperature_2m_max?.[i];
      const min = d.temperature_2m_min?.[i];
      const desc = describeWmo(code);
      let weekday = "";
      let short = iso;
      try {
        const dt = new Date(iso + "T00:00:00");
        weekday = dt
          .toLocaleDateString("nl-NL", { weekday: "short" })
          .replace(".", "");
        short = dt.toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "short",
        });
      } catch {
        /* fallback to ISO */
      }
      return {
        date: iso,
        weekday: weekday || iso.slice(8, 10),
        short,
        tempMin: typeof min === "number" ? `${Math.round(min)}°` : "—",
        tempMax: typeof max === "number" ? `${Math.round(max)}°` : "—",
        summary: desc.label,
        icon: desc.icon,
      };
    });
  } catch {
    return [];
  }
}

/** Map the WMO weather code (0..99) to a friendly label + icon name.
 *  Reference: https://open-meteo.com/en/docs (search "WMO Weather").
 *  Icon names map 1:1 to the SVG components in packages/ui/src/icon
 *  so the UI can render them via getAppIcon — never an emoji. */
function describeWmo(
  code: number,
): { label: string; icon: ForecastDay["icon"] } {
  if (code === 0) return { label: "Helder", icon: "weather-sun" };
  if (code === 1)
    return { label: "Vooral helder", icon: "weather-partly" };
  if (code === 2)
    return { label: "Half bewolkt", icon: "weather-partly" };
  if (code === 3) return { label: "Bewolkt", icon: "weather-cloud" };
  if (code === 45 || code === 48)
    return { label: "Mist", icon: "weather-fog" };
  if (code >= 51 && code <= 57)
    return { label: "Motregen", icon: "weather-rain" };
  if (code >= 61 && code <= 67)
    return { label: "Regen", icon: "weather-rain" };
  if (code >= 71 && code <= 77)
    return { label: "Sneeuw", icon: "weather-snow" };
  if (code >= 80 && code <= 82)
    return { label: "Buien", icon: "weather-rain" };
  if (code === 85 || code === 86)
    return { label: "Sneeuwbuien", icon: "weather-snow" };
  if (code >= 95) return { label: "Onweer", icon: "weather-storm" };
  return { label: "—", icon: "weather-cloud" };
}
