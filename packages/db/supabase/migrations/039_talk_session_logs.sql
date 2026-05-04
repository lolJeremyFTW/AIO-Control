-- 039_talk_session_logs.sql — session-level audit log for the voice pipeline.
--
-- Every /api/talk invocation creates one row after completion (or error).
-- Used for debugging, usage analytics, and the Talk Settings log display.
--
-- NOTE: There is intentionally no RLS on this table — rows are always
-- inserted server-side (service-role) so RLS would only block reads.
-- Read access is controlled by the parent workspace membership check
-- in the talk-settings page.

create table if not exists aio_control.talk_session_logs (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references aio_control.workspaces(id) on delete cascade,
  agent_id      uuid        not null references aio_control.agents(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- What the user said (empty if STT failed)
  transcription text,

  -- LLM prompt (truncated to 2000 chars)
  llm_prompt    text,

  -- LLM response text (truncated)
  llm_response  text,

  -- Which voice was used
  tts_voice_id  text,

  -- Timing
  duration_ms   integer,

  -- Error message if the pipeline failed at any step
  error_text    text,

  -- Which providers were used
  stt_provider  text,
  llm_model     text,
  tts_provider  text
);

-- Index for the Talk Settings log page (most recent first per workspace)
create index if not exists idx_talk_session_logs_workspace_created
  on aio_control.talk_session_logs (workspace_id, created_at desc);

-- Index for per-agent logs
create index if not exists idx_talk_session_logs_agent
  on aio_control.talk_session_logs (agent_id, created_at desc);

comment on table aio_control.talk_session_logs is
  'Per-interaction audit log for the voice pipeline. One row per /api/talk call.';
