-- 042_notification_dismissals.sql — Per-user "I've seen / dismissed this"
-- tracker for the notifications bell. Notifications are synthesized from
-- queue_items + failed runs, so we can't just mark them read on the source
-- row (different users would see each other's reads). One row per
-- (user, source) pair; presence = dismissed.

create table if not exists aio_control.notification_dismissals (
  user_id uuid not null references aio_control.profiles(id) on delete cascade,
  source_kind text not null check (source_kind in ('queue', 'run')),
  source_id uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, source_kind, source_id)
);

create index if not exists idx_notif_dismissals_user
  on aio_control.notification_dismissals(user_id);

alter table aio_control.notification_dismissals enable row level security;

drop policy if exists "notif_dismissals_self" on aio_control.notification_dismissals;
create policy "notif_dismissals_self"
  on aio_control.notification_dismissals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
