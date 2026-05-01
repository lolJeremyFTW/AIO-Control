-- 008_push_subscriptions.sql — Phase 7c: store browser push subscriptions
-- so the app can ping the operator (mobile or desktop) when a HITL item
-- needs review.
--
-- One row per (user, device). Endpoint is unique per browser install.

create table if not exists aio_control.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references aio_control.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table aio_control.push_subscriptions enable row level security;

drop policy if exists "push_subs_self" on aio_control.push_subscriptions;
create policy "push_subs_self"
  on aio_control.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
