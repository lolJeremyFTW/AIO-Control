-- 017_telegram_inbound.sql — log of inbound Telegram messages so we
-- have an audit trail of who said what to which bot. Phase 1 just
-- stores; phase 2 wires command dispatch (/run <agent>, /approve <id>).

create table if not exists aio_control.telegram_inbound (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  target_id uuid not null references aio_control.telegram_targets(id) on delete cascade,
  chat_id text not null,
  message_thread_id integer,
  from_user_id bigint,
  from_username text,
  text text,
  raw jsonb,
  -- Once we wire command dispatch, this gets set to the queue/run/etc
  -- the message triggered. Until then it's null (just a log row).
  dispatched_to text,
  dispatched_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_inbound_workspace
  on aio_control.telegram_inbound(workspace_id, created_at desc);
create index if not exists idx_telegram_inbound_target
  on aio_control.telegram_inbound(target_id, created_at desc);

alter table aio_control.telegram_inbound enable row level security;

drop policy if exists "telegram_inbound_member_read" on aio_control.telegram_inbound;
create policy "telegram_inbound_member_read" on aio_control.telegram_inbound
  for select using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

-- Only the service-role webhook writes; no member-level INSERT policy
-- so RLS denies-by-default.
