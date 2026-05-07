-- 061_notification_targets.sql - provider-neutral notification targets.
--
-- Slack and Discord launch on this generic layer first. Telegram keeps
-- its existing telegram_targets tables until the new path has proven
-- itself in production.

create table if not exists aio_control.notification_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  provider text not null check (provider in ('telegram', 'slack', 'discord')),
  scope text not null check (scope in ('workspace', 'business', 'navnode')),
  scope_id uuid not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  allowlist text[] not null default array[]::text[],
  denylist text[] not null default array[]::text[],
  send_run_done boolean not null default true,
  send_run_fail boolean not null default true,
  send_queue_review boolean not null default true,
  enabled boolean not null default true,
  created_by uuid references aio_control.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_targets_workspace
  on aio_control.notification_targets(workspace_id, provider, scope, scope_id);

alter table aio_control.notification_targets enable row level security;

drop policy if exists "notification_targets_member_read" on aio_control.notification_targets;
create policy "notification_targets_member_read" on aio_control.notification_targets
  for select using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "notification_targets_editor_write" on aio_control.notification_targets;
create policy "notification_targets_editor_write" on aio_control.notification_targets
  for all using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  );

create table if not exists aio_control.notification_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  owner_type text not null check (owner_type in ('workspace', 'business', 'navnode', 'agent', 'schedule')),
  owner_id uuid not null,
  target_id uuid not null references aio_control.notification_targets(id) on delete cascade,
  event_mask text[] not null default array['run_done','run_fail']::text[],
  created_by uuid references aio_control.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, owner_type, owner_id, target_id),
  check (event_mask <@ array['run_done','run_fail','queue_review']::text[])
);

create index if not exists idx_notification_bindings_owner
  on aio_control.notification_bindings(workspace_id, owner_type, owner_id);
create index if not exists idx_notification_bindings_target
  on aio_control.notification_bindings(target_id);

alter table aio_control.notification_bindings enable row level security;

drop policy if exists "notification_bindings_member_read" on aio_control.notification_bindings;
create policy "notification_bindings_member_read" on aio_control.notification_bindings
  for select using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "notification_bindings_editor_write" on aio_control.notification_bindings;
create policy "notification_bindings_editor_write" on aio_control.notification_bindings
  for all using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  );

create table if not exists aio_control.notification_inbound (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  target_id uuid references aio_control.notification_targets(id) on delete set null,
  provider text not null check (provider in ('telegram', 'slack', 'discord')),
  external_channel_id text,
  external_thread_id text,
  external_user_id text,
  external_username text,
  command text,
  text text,
  raw jsonb not null default '{}'::jsonb,
  dispatched_to text,
  dispatched_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_inbound_workspace
  on aio_control.notification_inbound(workspace_id, created_at desc);
create index if not exists idx_notification_inbound_target
  on aio_control.notification_inbound(target_id, created_at desc);

alter table aio_control.notification_inbound enable row level security;

drop policy if exists "notification_inbound_member_read" on aio_control.notification_inbound;
create policy "notification_inbound_member_read" on aio_control.notification_inbound
  for select using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

-- Writes are intentionally service-role only. Public Slack/Discord
-- endpoints will verify provider signatures, then persist through the
-- service-role client.
