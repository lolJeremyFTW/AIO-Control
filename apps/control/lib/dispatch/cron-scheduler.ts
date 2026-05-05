// Local cron scheduler for non-subscription agents.
//
// Bootstrapped from `instrumentation.ts` once per Node process. Every
// minute it scans all enabled cron schedules whose agent has
// key_source != 'subscription' (Claude subscription agents go through
// Anthropic Routines on Claude's own infra — those are NOT our job).
// For each due schedule we insert a `runs` row and call dispatchRun,
// the same way webhook + manual triggers do.
//
// De-dupe contract: we use `last_fired_at` as the watermark. A
// schedule fires when `nextRunAfter(last_fired_at, cron_expr) <= now`.
// If the process restarts mid-minute we may re-fire a schedule that
// already ran in the same minute — that's acceptable for now (the
// run row is cheap and the dispatcher's pre-flight checks block the
// double-run if needed).
//
// Scaling note: this runs in the Next.js Node process. With 100s of
// schedules per workspace it stays cheap (one indexed query per
// minute). When we eventually shard businesses across processes the
// scheduler must move to a dedicated worker — for now this is fine.

import "server-only";

import * as cron from "node-cron";

import { dispatchRun } from "./runs";
import { getServiceRoleSupabase } from "../supabase/service";

let started = false;
let task: cron.ScheduledTask | null = null;

export function startCronScheduler(): void {
  // Idempotent — instrumentation.ts may run twice in dev.
  if (started) return;
  started = true;

  // On boot: mark any run that was left in "running" state by a previous
  // crash as failed. Runs older than 30 min are definitely orphaned —
  // normal agent runs complete in seconds to a few minutes.
  void cleanupZombieRuns().catch((err) =>
    console.error("[cron-scheduler] zombie cleanup failed", err),
  );

  // node-cron expression "* * * * *" = every minute on the wall clock.
  task = cron.schedule(
    "* * * * *",
    () => {
      void tick().catch((err) => {
        console.error("[cron-scheduler] tick failed", err);
      });
    },
    { timezone: "UTC" },
  );

  // Run an immediate tick at boot so a schedule that was due during a
  // brief downtime fires within seconds, not at the next minute.
  void tick().catch((err) => {
    console.error("[cron-scheduler] initial tick failed", err);
  });

  console.log("[cron-scheduler] started — scanning every minute");
}

/** Mark runs stuck in "running" for > 30 min as failed.
 *  Called once at startup to recover from crashes/restarts. */
async function cleanupZombieRuns(): Promise<void> {
  const admin = getServiceRoleSupabase();
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { error, count } = await admin
    .from("runs")
    .update({
      status: "failed",
      error_text: "Run abandoned — process restarted mid-flight",
      ended_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("created_at", cutoff);
  if (error) {
    console.error("[cron-scheduler] zombie cleanup error", error);
  } else {
    console.log("[cron-scheduler] zombie run cleanup done");
  }
}

export function stopCronScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
  started = false;
}

/** One scan: find due cron schedules and dispatch a run for each. */
async function tick(): Promise<void> {
  const admin = getServiceRoleSupabase();

  // Periodically clean up zombie runs (>30 min in "running" state).
  // Running on every tick is cheap — the UPDATE only touches rows that
  // match, so it's a no-op most of the time.
  void cleanupZombieRuns().catch(() => {});

  // Query enabled cron schedules joined with their agents so we can
  // skip subscription-Claude (those run on Claude's own cron via
  // Routines, not here). RLS is bypassed by service-role.
  const { data, error } = await admin
    .from("schedules")
    .select(
      "id, workspace_id, agent_id, business_id, nav_node_id, cron_expr, instructions, last_fired_at, agents!inner(key_source, archived_at, nav_node_id)",
    )
    .eq("kind", "cron")
    .eq("enabled", true);
  if (error) {
    console.error("[cron-scheduler] schedules query failed", error);
    return;
  }
  if (!data || data.length === 0) return;

  type Row = {
    id: string;
    workspace_id: string;
    agent_id: string;
    business_id: string | null;
    nav_node_id: string | null;
    cron_expr: string | null;
    instructions: string | null;
    last_fired_at: string | null;
    agents: {
      key_source: string;
      archived_at: string | null;
      nav_node_id: string | null;
    };
  };

  const now = new Date();
  const due: Row[] = (data as unknown as Row[]).filter((r) => {
    if (!r.cron_expr) return false;
    if (r.agents.archived_at) return false;
    if (r.agents.key_source === "subscription") return false;
    if (!cron.validate(r.cron_expr)) return false;
    return shouldFire(r.cron_expr, r.last_fired_at, now);
  });

  if (due.length === 0) return;

  for (const sched of due) {
    try {
      // Concurrency guard: skip if a run for this schedule is still
      // "running". A hung previous run should not spawn a second one —
      // the zombie cleanup handles the eventual recovery.
      const { count: activeCount } = await admin
        .from("runs")
        .select("id", { count: "exact", head: true })
        .eq("schedule_id", sched.id)
        .eq("status", "running");
      if (activeCount && activeCount > 0) {
        console.log(
          `[cron-scheduler] schedule ${sched.id} already has a running run — skipping`,
        );
        continue;
      }

      // Atomic claim: only the tick that wins this UPDATE proceeds. We
      // guard on `last_fired_at` being either null or older than 60s
      // (matches the JS-side shouldFire window). Postgres serializes
      // the writes per row, so concurrent ticks from the two service
      // instances (aio-control + aio-control-root) collapse into one
      // run-insert without needing an advisory lock.
      const cutoff = new Date(now.getTime() - 60_000).toISOString();
      const { data: claimed, error: claimErr } = await admin
        .from("schedules")
        .update({ last_fired_at: now.toISOString() })
        .eq("id", sched.id)
        .or(`last_fired_at.is.null,last_fired_at.lt.${cutoff}`)
        .select("id")
        .maybeSingle();
      if (claimErr) {
        console.error("[cron-scheduler] claim update failed", claimErr);
        continue;
      }
      if (!claimed) {
        // Another tick (other service instance) won. Skip silently.
        continue;
      }

      const { data: run, error: runErr } = await admin
        .from("runs")
        .insert({
          workspace_id: sched.workspace_id,
          agent_id: sched.agent_id,
          business_id: sched.business_id,
          // Schedule's own pin wins over agent's pin (operator may park
          // the schedule under a sub-topic of the agent's home topic).
          nav_node_id: sched.nav_node_id ?? sched.agents.nav_node_id ?? null,
          schedule_id: sched.id,
          triggered_by: "cron",
          status: "queued",
          // The dispatcher reads `input.prompt` to build the message
          // list. Without this the run starts with "(no input)".
          input: sched.instructions
            ? { prompt: sched.instructions }
            : null,
        })
        .select("id")
        .single();
      if (runErr || !run) {
        console.error("[cron-scheduler] run insert failed", runErr);
        continue;
      }
      // Dispatch async — we don't want one slow agent to block other
      // schedules in the same tick.
      void dispatchRun(run.id).catch((err) => {
        console.error(`[cron-scheduler] dispatch failed for ${run.id}`, err);
      });
    } catch (err) {
      console.error("[cron-scheduler] schedule fire failed", err);
    }
  }
}

/**
 * Lightweight "should this cron expression fire NOW given when it last
 * fired?" check. We don't pull in cron-parser to keep deps small —
 * node-cron itself doesn't expose nextDate(), so we approximate:
 * fire if `now` matches the cron expression's wall-clock pattern AND
 * we haven't already fired during this exact minute.
 *
 * The typical user-facing intervals (every N minutes, hourly, daily)
 * all map cleanly to "did it match this minute and not the last?".
 */
function shouldFire(
  expr: string,
  lastFiredIso: string | null,
  now: Date,
): boolean {
  if (!matchesCron(expr, now)) return false;
  if (!lastFiredIso) return true;
  const last = new Date(lastFiredIso);
  // Already fired in this same minute? Skip.
  return now.getTime() - last.getTime() >= 60_000;
}

/** Minimal 5-field cron matcher (minute, hour, dom, month, dow). Accepts
 *  `*`, single number, comma list, range `a-b`, and step `* /n`. */
function matchesCron(expr: string, d: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hr, dom, mon, dow] = parts;
  return (
    matchField(min!, d.getUTCMinutes(), 0, 59) &&
    matchField(hr!, d.getUTCHours(), 0, 23) &&
    matchField(dom!, d.getUTCDate(), 1, 31) &&
    matchField(mon!, d.getUTCMonth() + 1, 1, 12) &&
    matchField(dow!, d.getUTCDay(), 0, 6)
  );
}

function matchField(
  field: string,
  value: number,
  min: number,
  max: number,
): boolean {
  if (field === "*") return true;
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [base, stepStr] = part.split("/");
      const step = Number(stepStr);
      if (!Number.isFinite(step) || step <= 0) continue;
      const baseRange = base === "*" ? `${min}-${max}` : base!;
      const [a, b] = parseRange(baseRange, min, max);
      if (a === null || b === null) continue;
      for (let n = a; n <= b; n += step) if (n === value) return true;
      continue;
    }
    if (part.includes("-")) {
      const [a, b] = parseRange(part, min, max);
      if (a === null || b === null) continue;
      if (value >= a && value <= b) return true;
      continue;
    }
    const n = Number(part);
    if (Number.isFinite(n) && n === value) return true;
  }
  return false;
}

function parseRange(
  s: string,
  min: number,
  max: number,
): [number | null, number | null] {
  const [aStr, bStr] = s.split("-");
  const a = aStr === "*" ? min : Number(aStr);
  const b = bStr === undefined ? a : bStr === "*" ? max : Number(bStr);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [null, null];
  return [a, b];
}
