-- 071_outreach_pipeline_module.sql
--
-- A silent, duplicate-safe outreach pipeline that runs beside the legacy
-- cron jobs. It writes visual stage events for the UI instead of chatty
-- Telegram/run reports, and uses Postgres claims/checksums as the source of
-- truth so the same destination is not outreached twice.

alter table aio_control.outreach_leads
  add column if not exists outreach_pipeline_run_id uuid,
  add column if not exists outreach_pipeline_claimed_at timestamptz,
  add column if not exists outreach_pipeline_attempts integer not null default 0,
  add column if not exists outreach_pipeline_error text,
  add column if not exists outreach_pipeline_qa jsonb,
  add column if not exists outreach_pipeline_outreached_at timestamptz,
  add column if not exists outreach_automation_proposal text,
  add column if not exists outreach_sent_checksum text;

create unique index if not exists idx_outreach_leads_pipeline_checksum_unique
  on aio_control.outreach_leads(workspace_id, outreach_sent_checksum)
  where outreach_sent_checksum is not null;

create index if not exists idx_outreach_leads_pipeline_eligible
  on aio_control.outreach_leads(workspace_id, business_id, status, outreach_pipeline_outreached_at, outreach_pipeline_claimed_at)
  where outreach_pipeline_outreached_at is null;

do $$
begin
  alter table aio_control.outreach_leads
    drop constraint if exists outreach_leads_status_chk;
  alter table aio_control.outreach_leads
    add constraint outreach_leads_status_chk check (status in (
      'new', 'pitched', 'approved', 'rejected', 'sent',
      'freebie_ready', 'pending_whatsapp', 'outreached',
      'contactformulier_failed', 'responded', 'handmatig'
    ));
end $$;

create table if not exists aio_control.outreach_pipeline_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid not null references aio_control.businesses(id) on delete cascade,
  enabled boolean not null default false,
  interval_seconds integer not null default 10 check (interval_seconds between 5 and 3600),
  batch_size integer not null default 3 check (batch_size between 1 and 25),
  delivery_mode text not null default 'local_outbox'
    check (delivery_mode in ('local_outbox')),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_error text,
  total_cycles integer not null default 0,
  total_outreached_count integer not null default 0,
  total_duplicate_skipped integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, business_id)
);

drop trigger if exists trg_touch_outreach_pipeline_configs on aio_control.outreach_pipeline_configs;
create trigger trg_touch_outreach_pipeline_configs
  before update on aio_control.outreach_pipeline_configs
  for each row execute function aio_control._touch_updated_at();

create table if not exists aio_control.outreach_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid not null references aio_control.businesses(id) on delete cascade,
  config_id uuid references aio_control.outreach_pipeline_configs(id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'done', 'failed', 'skipped')),
  claimed_count integer not null default 0,
  outreached_count integer not null default 0,
  duplicate_skipped_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_pipeline_runs_business_time
  on aio_control.outreach_pipeline_runs(workspace_id, business_id, created_at desc);

create table if not exists aio_control.outreach_pipeline_events (
  id bigserial primary key,
  run_id uuid references aio_control.outreach_pipeline_runs(id) on delete cascade,
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid not null references aio_control.businesses(id) on delete cascade,
  lead_id uuid references aio_control.outreach_leads(id) on delete set null,
  stage text not null,
  agent_name text not null,
  event_type text not null
    check (event_type in ('ping', 'done', 'skip', 'error', 'metric', 'qa')),
  message text,
  delta_outreached integer not null default 0,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_pipeline_events_business_time
  on aio_control.outreach_pipeline_events(workspace_id, business_id, created_at desc);
create index if not exists idx_outreach_pipeline_events_run_time
  on aio_control.outreach_pipeline_events(run_id, created_at asc);

alter table aio_control.outreach_pipeline_configs enable row level security;
alter table aio_control.outreach_pipeline_runs enable row level security;
alter table aio_control.outreach_pipeline_events enable row level security;

drop policy if exists "outreach_pipeline_configs_read" on aio_control.outreach_pipeline_configs;
create policy "outreach_pipeline_configs_read"
  on aio_control.outreach_pipeline_configs for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "outreach_pipeline_configs_write" on aio_control.outreach_pipeline_configs;
create policy "outreach_pipeline_configs_write"
  on aio_control.outreach_pipeline_configs for all
  using (aio_control.is_workspace_member(workspace_id))
  with check (aio_control.is_workspace_member(workspace_id));

drop policy if exists "outreach_pipeline_runs_read" on aio_control.outreach_pipeline_runs;
create policy "outreach_pipeline_runs_read"
  on aio_control.outreach_pipeline_runs for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "outreach_pipeline_events_read" on aio_control.outreach_pipeline_events;
create policy "outreach_pipeline_events_read"
  on aio_control.outreach_pipeline_events for select
  using (aio_control.is_workspace_member(workspace_id));

create or replace function aio_control.claim_outreach_pipeline_leads(
  p_workspace_id uuid,
  p_business_id uuid,
  p_run_id uuid,
  p_limit integer
)
returns setof aio_control.outreach_leads
language sql
security definer
set search_path = aio_control, public
as $$
  with candidates as (
    select id
      from aio_control.outreach_leads
     where workspace_id = p_workspace_id
       and business_id = p_business_id
       and outreach_pipeline_outreached_at is null
       and sent_at is null
       and status in ('new', 'pitched', 'approved', 'freebie_ready')
       and coalesce(trim(lead_name), '') <> ''
       and lower(coalesce(lead_name, '')) not like 'test%'
       and lower(coalesce(lead_branche, '')) <> 'test'
       and (
         outreach_pipeline_claimed_at is null
         or outreach_pipeline_claimed_at < now() - interval '15 minutes'
       )
     order by
       case status
         when 'freebie_ready' then 0
         when 'pitched' then 1
         when 'approved' then 2
         else 3
       end,
       updated_at asc nulls last,
       created_at asc
     limit greatest(1, least(coalesce(p_limit, 3), 25))
     for update skip locked
  )
  update aio_control.outreach_leads l
     set outreach_pipeline_run_id = p_run_id,
         outreach_pipeline_claimed_at = now(),
         outreach_pipeline_attempts = coalesce(l.outreach_pipeline_attempts, 0) + 1,
         outreach_pipeline_error = null,
         updated_at = now()
    from candidates c
   where l.id = c.id
  returning l.*;
$$;

grant execute on function aio_control.claim_outreach_pipeline_leads(uuid, uuid, uuid, integer)
  to authenticated, service_role;

do $$
begin
  begin
    alter publication supabase_realtime add table aio_control.outreach_pipeline_configs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table aio_control.outreach_pipeline_runs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table aio_control.outreach_pipeline_events;
  exception when duplicate_object then null;
  end;
end $$;
