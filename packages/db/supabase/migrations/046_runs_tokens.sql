-- 046_runs_tokens.sql — Add input/output token tracking to runs.
-- Shows token usage per run in the RunsToaster toast footer.

alter table aio_control.runs
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer;
