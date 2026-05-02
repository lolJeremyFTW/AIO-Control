// Settings actions that mutate the workspace row itself (weather coords,
// name). Owner/admin only — RLS allows owner+admin to UPDATE workspaces.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function updateWorkspaceWeather(input: {
  workspace_slug: string;
  workspace_id: string;
  city: string;
  lat: number;
  lon: number;
}): Promise<ActionResult<null>> {
  if (!input.city.trim())
    return { ok: false, error: "Stad mag niet leeg zijn." };
  if (Number.isNaN(input.lat) || Number.isNaN(input.lon)) {
    return { ok: false, error: "Coördinaten moeten getallen zijn." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      weather_city: input.city.trim(),
      weather_lat: input.lat,
      weather_lon: input.lon,
    })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}`, "layout");
  return { ok: true, data: null };
}

export async function updateWorkspaceSpendLimits(input: {
  workspace_slug: string;
  workspace_id: string;
  daily_cents: number | null;
  monthly_cents: number | null;
  auto_pause: boolean;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      daily_spend_limit_cents: input.daily_cents,
      monthly_spend_limit_cents: input.monthly_cents,
      auto_pause_on_limit: input.auto_pause,
    })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}

/**
 * Geocode a city name to coords via Open-Meteo's free geocoding API.
 * No key needed. Returns the first match — UI feeds the lat/lon into
 * updateWorkspaceWeather.
 */
export async function geocodeCity(
  city: string,
): Promise<ActionResult<{ name: string; country: string; lat: number; lon: number }>> {
  if (!city.trim()) return { ok: false, error: "City required" };
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return { ok: false, error: `Geocoder: ${res.status}` };
    const data = (await res.json()) as {
      results?: { name: string; country: string; latitude: number; longitude: number }[];
    };
    const hit = data.results?.[0];
    if (!hit) return { ok: false, error: "Plaats niet gevonden." };
    return {
      ok: true,
      data: {
        name: hit.name,
        country: hit.country,
        lat: hit.latitude,
        lon: hit.longitude,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Geocoding failed",
    };
  }
}
