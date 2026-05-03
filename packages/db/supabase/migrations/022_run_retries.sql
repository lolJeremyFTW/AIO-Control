-- 022_run_retries.sql — exponential-backoff retry for failed runs.
-- Most provider failures are transient (network blip, rate limit,
-- 503). We let the dispatcher retry up to N times with delays.
--
-- Schema:
--   runs.attempt           which attempt this row represents (1, 2, 3…)
--   runs.max_attempts      cap from the agent config; default 3
--   runs.next_retry_at     when the retry-loop should pick this up

alter table aio_control.runs
  add column if not exists attempt integer not null default 1,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz;

-- Index for the retry sweep job: pending failed-but-retryable rows
-- ordered by their scheduled retry time.
create index if not exists idx_runs_retry_due
  on aio_control.runs(next_retry_at asc)
  where status = 'failed' and next_retry_at is not null;

-- Helper: list runs whose retry window is in the past so a cron /
-- worker can re-queue them. Used by /api/runs/retry-sweep.
create or replace view aio_control.runs_due_for_retry as
select id, workspace_id, agent_id, business_id, attempt, max_attempts
from aio_control.runs
where status = 'failed'
  and next_retry_at is not null
  and next_retry_at <= now()
  and attempt < max_attempts;

grant select on aio_control.runs_due_for_retry to authenticated, service_role;
