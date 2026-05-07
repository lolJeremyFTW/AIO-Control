-- 062_provider_connection_logs.sql - visible diagnostics for user-configured
-- providers in Settings. This is deliberately separate from audit_logs:
-- audit_logs says what row changed, provider_connection_logs says whether a
-- connection/test/scan actually worked and why it failed.

create table if not exists aio_control.provider_connection_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  actor_id uuid references aio_control.profiles(id) on delete set null,
  provider text not null,
  event_type text not null,
  status text not null check (status in ('success', 'error', 'info')),
  latency_ms integer,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_connection_logs_workspace_provider_created
  on aio_control.provider_connection_logs (workspace_id, provider, created_at desc);

create index if not exists idx_provider_connection_logs_actor_created
  on aio_control.provider_connection_logs (actor_id, created_at desc);

alter table aio_control.provider_connection_logs enable row level security;

drop policy if exists "provider_connection_logs_read_member"
  on aio_control.provider_connection_logs;
create policy "provider_connection_logs_read_member"
  on aio_control.provider_connection_logs for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "provider_connection_logs_insert_member"
  on aio_control.provider_connection_logs;
create policy "provider_connection_logs_insert_member"
  on aio_control.provider_connection_logs for insert
  with check (
    actor_id = auth.uid()
    and aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
  );

grant select, insert on aio_control.provider_connection_logs to authenticated;

comment on table aio_control.provider_connection_logs is
  'User-visible provider diagnostics for Settings. Never store API keys or OAuth tokens here.';
comment on column aio_control.provider_connection_logs.metadata is
  'Safe diagnostic metadata only: endpoint, status code, model count, tool id, etc. No secrets.';
