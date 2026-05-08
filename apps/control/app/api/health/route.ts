// Liveness + readiness check. Caddy can hit this; later we can wire it up
// to a richer monitor (Uptime Kuma, etc.). We hit Supabase Auth's /health
// instead of postgres directly because postgres-js + drizzle would pull a
// connection from the pool just for the heartbeat — overkill.

import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../lib/supabase/service";

export const dynamic = "force-dynamic";

type Result = { ok: boolean; latency_ms: number; error?: string };
type RuntimeResult = {
  ok: boolean;
  latency_ms: number;
  running_runs: number;
  stale_running_runs: number;
  queued_runs: number;
  error?: string;
};

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

async function checkRuntimePressure(): Promise<RuntimeResult> {
  const start = Date.now();
  const staleAfterMinutes = Number(
    process.env.HEALTH_STALE_RUN_MINUTES ?? "15",
  );
  const maxRunning = Number(process.env.HEALTH_MAX_RUNNING_RUNS ?? "5");
  const maxQueued = Number(process.env.HEALTH_MAX_QUEUED_RUNS ?? "25");
  try {
    const supabase = getServiceRoleSupabase();
    const staleCutoff = new Date(
      Date.now() - staleAfterMinutes * 60_000,
    ).toISOString();
    const [running, stale, queued] = await Promise.all([
      supabase
        .from("runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running"),
      supabase
        .from("runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .lt("started_at", staleCutoff),
      supabase
        .from("runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued"),
    ]);
    const firstError = running.error ?? stale.error ?? queued.error;
    if (firstError) {
      return {
        ok: false,
        latency_ms: Date.now() - start,
        running_runs: 0,
        stale_running_runs: 0,
        queued_runs: 0,
        error: firstError.message,
      };
    }
    const runningRuns = running.count ?? 0;
    const staleRunningRuns = stale.count ?? 0;
    const queuedRuns = queued.count ?? 0;
    return {
      ok:
        staleRunningRuns === 0 &&
        runningRuns <= maxRunning &&
        queuedRuns <= maxQueued,
      latency_ms: Date.now() - start,
      running_runs: runningRuns,
      stale_running_runs: staleRunningRuns,
      queued_runs: queuedRuns,
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      running_runs: 0,
      stale_running_runs: 0,
      queued_runs: 0,
      error: err instanceof Error ? err.message : "runtime check failed",
    };
  }
}

export async function GET() {
  const [supabase, runtime] = await Promise.all([
    pingSupabase(),
    checkRuntimePressure(),
  ]);
  const ok = supabase.ok && runtime.ok;
  const ready = supabase.ok;
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      time: new Date().toISOString(),
      checks: { supabase, runtime },
    },
    {
      status: ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
