// Server action wrapper around the open-meteo forecast helper. The
// header weather chip lazy-loads the 10-day forecast on first click.

"use server";

import {
  getWeatherForecast,
  type ForecastDay,
} from "../../lib/weather/open-meteo";

export async function loadForecast(input: {
  workspace_id: string;
}): Promise<{ ok: true; data: ForecastDay[] } | { ok: false; error: string }> {
  try {
    const data = await getWeatherForecast(input.workspace_id);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Forecast load failed.",
    };
  }
}
