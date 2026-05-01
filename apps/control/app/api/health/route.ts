// Liveness + readiness check. Caddy can hit this; later we can wire it up
// to a richer monitor (Uptime Kuma, etc.). We hit Supabase Auth's /health
// instead of postgres directly because postgres-js + drizzle would pull a
// connection from the pool just for the heartbeat — overkill.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Result = { ok: boolean; latency_ms: number; error?: string };

async function pingSupabase(): Promise<Result> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon)
    return { ok: false, latency_ms: 0, error: "no SUPABASE_URL/anon" };
  const start = Date.now();
  try {
    // Kong's apikey plugin gates everything behind /auth/v1, including
    // /health, so we MUST send the anon key. We hit /auth/v1/settings
    // because /health is gotrue-only and returns version info — settings
    // is cheaper and exercises the same auth path.
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anon },
      signal: AbortSignal.timeout(2500),
    });
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      error: res.ok ? undefined : `auth ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "ping failed",
    };
  }
}

export async function GET() {
  const supabase = await pingSupabase();
  const ok = supabase.ok;
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      time: new Date().toISOString(),
      checks: { supabase },
    },
    {
      status: ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
