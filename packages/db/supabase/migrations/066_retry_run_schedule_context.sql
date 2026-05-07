-- 066_retry_run_schedule_context.sql
-- Preserve and backfill schedule context for retry/manual runs.
--
-- Retry rows used to copy only agent/business/input from the failed run.
-- That made the UI lose the cron job name even though the prompt still
-- matched a schedule. Future code now stores schedule_id plus an input
-- snapshot; this migration repairs safe historical rows with an exact,
-- unambiguous prompt match.

CREATE OR REPLACE VIEW aio_control.runs_due_for_retry AS
SELECT
  id,
  workspace_id,
  agent_id,
  business_id,
  schedule_id,
  nav_node_id,
  attempt,
  max_attempts
FROM aio_control.runs
WHERE status = 'failed'
  AND next_retry_at IS NOT NULL
  AND next_retry_at <= NOW()
  AND created_at > NOW() - INTERVAL '6 hours'
  AND attempt < max_attempts;

GRANT SELECT ON aio_control.runs_due_for_retry TO authenticated, service_role;

WITH candidates AS (
  SELECT
    r.id AS run_id,
    s.id AS schedule_id,
    s.nav_node_id,
    s.title,
    s.kind,
    s.cron_expr,
    COUNT(*) OVER (PARTITION BY r.id) AS match_count
  FROM aio_control.runs r
  JOIN aio_control.schedules s
    ON s.workspace_id = r.workspace_id
   AND s.agent_id = r.agent_id
   AND (
      s.business_id IS NOT DISTINCT FROM r.business_id
      OR r.business_id IS NULL
   )
   AND NULLIF(BTRIM(s.instructions), '') =
       NULLIF(BTRIM(r.input ->> 'prompt'), '')
  WHERE r.schedule_id IS NULL
    AND r.triggered_by IN ('retry', 'cron', 'manual')
    AND jsonb_typeof(r.input) = 'object'
    AND NULLIF(BTRIM(r.input ->> 'prompt'), '') IS NOT NULL
)
UPDATE aio_control.runs r
   SET schedule_id = c.schedule_id,
       nav_node_id = COALESCE(r.nav_node_id, c.nav_node_id),
       input = r.input || jsonb_build_object(
         'schedule',
         jsonb_build_object(
           'id', c.schedule_id,
           'title', c.title,
           'kind', c.kind,
           'cron_expr', c.cron_expr
         )
       )
  FROM candidates c
 WHERE r.id = c.run_id
   AND c.match_count = 1;
