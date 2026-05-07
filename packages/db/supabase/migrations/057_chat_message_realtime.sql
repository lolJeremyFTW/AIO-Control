-- 057_chat_message_realtime.sql -- Live chat follow-up pings.
-- ChatPanel subscribes to INSERTs on chat_messages so delayed assistant
-- pings can appear in the original chatbox after the stream has closed.

create table if not exists aio_control.chat_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references aio_control.chat_threads(id) on delete cascade,
  message text not null,
  due_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_scheduled_messages_due
  on aio_control.chat_scheduled_messages(due_at)
  where delivered_at is null;

alter table aio_control.chat_scheduled_messages enable row level security;

do $$
begin
  alter publication supabase_realtime add table aio_control.chat_messages;
exception
  when duplicate_object then null;
end $$;
