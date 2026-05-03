-- 038_talk_settings.sql — workspace-level "Talk to AI" preferences:
-- the default provider/voice/model used by the header's mic button.
--
-- Per-agent overrides will land later as agents.voice_overrides jsonb;
-- for v3 this row is the single source of truth.
--
-- The actual provider API keys live in the existing api_keys table
-- under synthetic providers ("elevenlabs", "openai_tts",
-- "azure_speech") — same pattern as smtp_*.

create table if not exists aio_control.talk_settings (
  workspace_id uuid primary key references aio_control.workspaces(id) on delete cascade,
  provider text not null default 'elevenlabs'
    check (provider in ('elevenlabs', 'openai', 'azure', 'native')),
  model text not null default 'eleven_multilingual_v2',
  llm text not null default 'claude-sonnet-4-5',
  stt text not null default 'whisper-1',
  voice text not null default 'rachel',
  -- 0..1 — ElevenLabs-style stability + similarity sliders. Other
  -- providers ignore them (we keep the schema flat anyway).
  stability numeric(4,3) not null default 0.55,
  similarity numeric(4,3) not null default 0.75,
  push_to_talk boolean not null default false,
  auto_stop boolean not null default true,
  hotword boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_touch_talk_settings on aio_control.talk_settings;
create trigger trg_touch_talk_settings
  before update on aio_control.talk_settings
  for each row execute function aio_control._touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table aio_control.talk_settings enable row level security;

drop policy if exists "talk_settings_read_member" on aio_control.talk_settings;
create policy "talk_settings_read_member"
  on aio_control.talk_settings for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "talk_settings_upsert_editor" on aio_control.talk_settings;
create policy "talk_settings_upsert_editor"
  on aio_control.talk_settings for insert
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "talk_settings_update_editor" on aio_control.talk_settings;
create policy "talk_settings_update_editor"
  on aio_control.talk_settings for update
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
