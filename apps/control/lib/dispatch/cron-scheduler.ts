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

// Per-workspace dispatch queue. Schedules within a single workspace run
// SEQUENTIALLY (5s gap between) so we never burst the per-key MiniMax
// bucket. Different workspaces stay parallel — workspace A's busy queue
// never blocks workspace B's interactive chat or cron.
//
// Each queue entry carries an enqueue timestamp so we can drop stale
// retries that piled up while the workspace was unhealthy: better to
// run TODAY's find-leads than yesterday's failed retry.
type QueueEntry = {
  runId: string;
  enqueuedAt: number;
};
type WorkspaceQueue = {
  pending: QueueEntry[];
  running: boolean;
};
const workspaceQueues = new Map<string, WorkspaceQueue>();

const QUEUE_INTER_RUN_DELAY_MS = Number(
  process.env.CRON_QUEUE_INTER_RUN_DELAY_MS ?? "5000",
);
// Cap how many runs can pile up per workspace. With 5 cron-firings + N
// retries from a transient outage, the queue can grow unbounded; cap so
// new schedule ticks aren't blocked behind an hour of retries.
const MAX_QUEUE_PER_WORKSPACE = Number(
  process.env.CRON_QUEUE_MAX_PER_WORKSPACE ?? "5",
);
// Drop pending entries older than this from the queue head — they were
// queued during a long outage and the data they're working against is
// likely stale.
const QUEUE_MAX_AGE_MS = Number(
  process.env.CRON_QUEUE_MAX_AGE_MS ?? String(60 * 60_000),
);

async function markQueueRejected(runId: string, reason: string): Promise<void> {
  const admin = getServiceRoleSupabase();
  await admin
    .from("runs")
    .update({
      status: "failed",
      error_text: reason,
      ended_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "queued");
}

function enqueueDispatch(workspaceId: string, runId: string): void {
  let q = workspaceQueues.get(workspaceId);
  if (!q) {
    q = { pending: [], running: false };
    workspaceQueues.set(workspaceId, q);
  }

  // Evict aged-out entries before deciding capacity.
  const ageCutoff = Date.now() - QUEUE_MAX_AGE_MS;
  const aged = q.pending.filter((e) => e.enqueuedAt < ageCutoff);
  if (aged.length > 0) {
    q.pending = q.pending.filter((e) => e.enqueuedAt >= ageCutoff);
    for (const e of aged) {
      void markQueueRejected(
        e.runId,
        "Queue entry aged out — pending too long, data is stale",
      );
    }
    console.log(
      `[cron-queue] dropped ${aged.length} stale entries from workspace ${workspaceId}`,
    );
  }

  if (q.pending.length >= MAX_QUEUE_PER_WORKSPACE) {
    void markQueueRejected(
      runId,
      `Queue full for workspace (>${MAX_QUEUE_PER_WORKSPACE} pending) — try again next cycle`,
    );
    console.warn(
      `[cron-queue] workspace ${workspaceId} queue full — rejecting ${runId}`,
    );
    return;
  }

  q.pending.push({ runId, enqueuedAt: Date.now() });
  if (!q.running) {
    q.running = true;
    void drainWorkspaceQueue(workspaceId).catch((err) =>
      console.error(`[cron-queue] drain failed for workspace ${workspaceId}`, err),
    );
  }
}

async function drainWorkspaceQueue(workspaceId: string): Promise<void> {
  const q = workspaceQueues.get(workspaceId);
  if (!q) return;
  while (q.pending.length > 0) {
    const entry = q.pending.shift();
    if (!entry) break;
    // Skip if the entry aged out while waiting in the queue.
    if (Date.now() - entry.enqueuedAt > QUEUE_MAX_AGE_MS) {
      void markQueueRejected(
        entry.runId,
        "Queue entry aged out before dispatch",
      );
      continue;
    }
    try {
      await dispatchRun(entry.runId);
    } catch (err) {
      console.error(`[cron-queue] dispatch failed for ${entry.runId}`, err);
    }
    if (q.pending.length > 0) {
      await new Promise((r) => setTimeout(r, QUEUE_INTER_RUN_DELAY_MS));
    }
  }
  q.running = false;
}

export function startCronScheduler(): void {
  // Idempotent — instrumentation.ts may run twice in dev.
  if (started) return;
  started = true;

  // On boot: any "running" run was abandoned by the previous process —
  // reap them all immediately so retry-sweep picks them up. Without this
  // they sit in "running" status until the 25-min zombie cleanup window,
  // and the schedule is locked out by the "already running" guard.
  void reapStartupOrphans().catch((err) =>
    console.error("[cron-scheduler] reap failed", err),
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

/** Mark runs stuck in "running" for > 25 min as failed. Most legit runs
 *  finish in 5-15 min, so 25 min is a safe backstop without killing
 *  active work. Earlier defenses kick in first:
 *    - MiniMax stream stall watchdog: 90s
 *    - Per-run hard timeout in dispatchRun: 20 min */
async function cleanupZombieRuns(): Promise<void> {
  const admin = getServiceRoleSupabase();
  const cutoff = new Date(Date.now() - 25 * 60_000).toISOString();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("runs")
    .update({
      status: "failed",
      error_text: "Run abandoned — exceeded 25 min wallclock (zombie cleanup)",
      ended_at: nowIso,
      // Queue for retry too — a zombie may be a single-incident hang;
      // give it one more shot before giving up. Capped by max_attempts.
      next_retry_at: nowIso,
    })
    .eq("status", "running")
    .lt("created_at", cutoff);
  if (error) {
    console.error("[cron-scheduler] zombie cleanup error", error);
  } else {
    console.log("[cron-scheduler] zombie run cleanup done");
  }
}

/** On boot: any run still in "running" status was orphaned by the previous
 *  process (crash or restart). Mark them failed AND schedule them for an
 *  immediate retry so the work resumes within ~1 minute instead of being
 *  lost. The cron instructions are idempotent (find-leads dedupes against
 *  existing leads, pitch skips leads that already have a pitch, freebie
 *  skips leads that already have a freebieFile, etc.) — so a fresh retry
 *  naturally picks up where the killed run left off, without needing to
 *  preserve in-memory state across restarts.
 *
 *  next_retry_at = now() makes the run eligible immediately. Attempt is
 *  not bumped here; it's bumped by retry-sweep when it dispatches the
 *  successor row, capped by max_attempts (default 3). */
async function reapStartupOrphans(): Promise<void> {
  const admin = getServiceRoleSupabase();
  const nowIso = new Date().toISOString();
  const { count, error } = await admin
    .from("runs")
    .update(
      {
        status: "failed",
        error_text: "Run orphaned — service restarted while in flight",
        ended_at: nowIso,
        // Eligible for retry-sweep on the next minute tick. The view's
        // freshness guard (6h) keeps us from re-running stale orphans
        // from days ago — only recent work resumes.
        next_retry_at: nowIso,
      },
      { count: "exact" },
    )
    .eq("status", "running");
  if (error) {
    console.error("[cron-scheduler] startup orphan reap failed", error);
  } else if (count && count > 0) {
    console.log(`[cron-scheduler] reaped ${count} orphan runs — queued for retry`);
  }
}

/** Pick up failed runs whose `next_retry_at` has passed and re-dispatch
 *  them as a NEW run row with attempt = previous + 1. Mirrors the HTTP
 *  retry-sweep endpoint but runs in-process so we don't need an external
 *  cron daemon. */
async function runRetrySweep(): Promise<void> {
  const admin = getServiceRoleSupabase();
  // Cap dispatches per tick: bursting 20 retries at once will trip
  // MiniMax's per-key rate limiter (Token Plan = ~5 concurrent).
  // 2/min = 120/hour throughput which is ample for normal failure rates,
  // and gives MiniMax breathing room between simultaneous calls.
  const RETRIES_PER_TICK = Number(process.env.RETRY_SWEEP_PER_TICK ?? "2");
  const { data: due } = await admin
    .from("runs_due_for_retry")
    .select("id, workspace_id, agent_id, business_id, attempt, max_attempts")
    .limit(RETRIES_PER_TICK);
  if (!due || due.length === 0) return;

  for (const r of due) {
    const { data: original } = await admin
      .from("runs")
      .select("input")
      .eq("id", r.id as string)
      .maybeSingle();

    const { data: newRun } = await admin
      .from("runs")
      .insert({
        workspace_id: r.workspace_id,
        agent_id: r.agent_id,
        business_id: r.business_id,
        triggered_by: "retry",
        status: "queued",
        input: original?.input ?? null,
        attempt: ((r.attempt as number) ?? 1) + 1,
        max_attempts: r.max_attempts,
      })
      .select("id")
      .single();
    if (!newRun) continue;

    await admin
      .from("runs")
      .update({ next_retry_at: null })
      .eq("id", r.id as string);

    // Route retries through the same workspace queue so they don't burst
    // either. With RETRIES_PER_TICK=2 + queue serialization, a retry
    // pile-up turns into a steady drip instead of a stampede.
    enqueueDispatch(r.workspace_id as string, newRun.id as string);
    console.log(
      `[cron-scheduler] retried ${r.id} → ${newRun.id} (attempt ${(r.attempt as number) + 1}/${r.max_attempts})`,
    );
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

  // Periodically clean up zombie runs (>15 min in "running" state) and
  // pick up failed runs that are due for retry. Both are no-ops when
  // there's nothing to do, so running every tick is cheap.
  void cleanupZombieRuns().catch(() => {});
  void runRetrySweep().catch((err) =>
    console.error("[cron-scheduler] retry sweep failed", err),
  );

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
      // Enqueue for sequential dispatch within this workspace. Different
      // workspaces run in parallel; same-workspace schedules wait their
      // turn so we never burst MiniMax/etc. with N concurrent calls per
      // key. The queue runs on a separate microtask so the tick returns
      // quickly even if the queue is long.
      enqueueDispatch(sched.workspace_id, run.id as string);
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
