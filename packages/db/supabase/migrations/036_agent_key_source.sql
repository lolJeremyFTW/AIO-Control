-- 036_agent_key_source.sql — let an agent declare WHERE its credentials
-- come from. Drives both the chat/run dispatch path AND the cron-mode
-- routing introduced in v3 workstream E:
--
--   subscription   Claude Pro/Max/Team — runs go through Claude
--                  Routines on Claude's own infra (no external API
--                  calls from us). ONLY valid for provider='claude'.
--   api_key        A regular Anthropic / OpenRouter / MiniMax API key
--                  is configured for this agent (via api_keys table or
--                  env). Local cron + direct-stream dispatch.
--   env            Same as api_key but the credential lives in a
--                  process env var. (Default for backward-compat.)
--
-- For non-Claude providers (openrouter, minimax, ollama, openclaw,
-- hermes, codex) only api_key/env make sense — there's no Claude
-- subscription path. App-level validation enforces this.

alter table aio_control.agents
  add column if not exists key_source text not null default 'env'
    check (key_source in ('subscription', 'api_key', 'env'));

-- Useful when the cron-scheduler queries due schedules: it needs to
-- know per-agent which dispatch path to take.
create index if not exists idx_agents_key_source
  on aio_control.agents(key_source) where archived_at is null;
