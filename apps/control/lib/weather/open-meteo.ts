// Server-side weather fetcher. Open-Meteo is free + key-less, so no env
// var needed. We cache the response for 10 minutes via Next's fetch cache
// (revalidate: 600) — current temperature doesn't change faster than that.
//
// Default location is Breda (Jeremy's HQ). Override by setting
// WEATHER_LATITUDE / WEATHER_LONGITUDE / WEATHER_CITY in the env.

import "server-only";

const LAT = process.env.WEATHER_LATITUDE ?? "51.589";
const LON = process.env.WEATHER_LONGITUDE ?? "4.776";
const CITY = process.env.WEATHER_CITY ?? "Breda";

export type Weather = { city: string; date: string; temp: string };

const FALLBACK: Weather = { city: CITY, date: "—", temp: "—" };

export async function getWeather(): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(LAT)}` +
    `&longitude=${encodeURIComponent(LON)}` +
    `&current=temperature_2m&timezone=Europe%2FAmsterdam`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; time?: string };
    };
    const temp = data.current?.temperature_2m;
    const iso = data.current?.time;
    return {
      city: CITY,
      date: iso ? formatDate(iso) : FALLBACK.date,
      temp: typeof temp === "number" ? `${Math.round(temp)}°` : FALLBACK.temp,
    };
  } catch {
    return FALLBACK;
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
