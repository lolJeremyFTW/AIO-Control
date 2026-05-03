-- 041_run_message_history.sql — Capture the full conversational stream per run.
-- Lets the UI render a past run as a chat (user → assistant → tool_call →
-- tool_result → error), instead of only the aggregated final output text.
-- Populated by lib/dispatch/runs.ts as it consumes the AGUIEvent stream.

alter table aio_control.runs
  add column if not exists message_history jsonb;

comment on column aio_control.runs.message_history is
  'Ordered array of run steps captured during dispatch: user/assistant/tool_call/error. Null for legacy runs.';
