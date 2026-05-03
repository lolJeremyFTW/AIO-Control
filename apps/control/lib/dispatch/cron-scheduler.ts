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

  // Query enabled cron schedules joined with their agents so we can
  // skip subscription-Claude (those run on Claude's own cron via
  // Routines, not here). RLS is bypassed by service-role.
  const { data, error } = await admin
    .from("schedules")
    .select(
      "id, workspace_id, agent_id, business_id, cron_expr, instructions, last_fired_at, agents!inner(key_source, archived_at)",
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
    cron_expr: string | null;
    instructions: string | null;
    last_fired_at: string | null;
    agents: { key_source: string; archived_at: string | null };
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
      const { data: run, error: runErr } = await admin
        .from("runs")
        .insert({
          workspace_id: sched.workspace_id,
          agent_id: sched.agent_id,
          business_id: sched.business_id,
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
      // Update watermark BEFORE dispatch so a slow dispatch doesn't
      // double-fire on the next tick.
      await admin
        .from("schedules")
        .update({ last_fired_at: now.toISOString() })
        .eq("id", sched.id);
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
