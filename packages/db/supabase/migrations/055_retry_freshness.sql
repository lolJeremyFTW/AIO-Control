-- 052_retry_freshness.sql — retry-sweep guard against ancient failures.
--
-- The cron-scheduler now calls runRetrySweep() every minute. The original
-- view didn't bound by age, so the first tick after enabling could try to
-- re-queue every failed run from the past few weeks at once. Cap to 6
-- hours: anything older is almost certainly stale (lead lists changed,
-- pitch templates updated, MCP server config rotated) and a blind retry
-- would hit a moving target.

CREATE OR REPLACE VIEW aio_control.runs_due_for_retry AS
SELECT id, workspace_id, agent_id, business_id, attempt, max_attempts
FROM aio_control.runs
WHERE status = 'failed'
  AND next_retry_at IS NOT NULL
  AND next_retry_at <= NOW()
  AND created_at > NOW() - INTERVAL '6 hours'
  AND attempt < max_attempts;

GRANT SELECT ON aio_control.runs_due_for_retry TO authenticated, service_role;
