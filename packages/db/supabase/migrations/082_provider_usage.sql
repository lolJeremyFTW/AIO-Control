-- 082_provider_usage.sql
-- Provider-level usage ledger for cost reconciliation.
--
-- Existing cost UI reads runs.cost_cents. This table keeps the more explicit
-- per-provider/per-model ledger the TrompTech Brain plan needs, while still
-- linking every row back to a run for replay/debugging.

create table if not exists aio_control.provider_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  nav_node_id uuid references aio_control.nav_nodes(id) on delete set null,
  agent_id uuid references aio_control.agents(id) on delete set null,
  schedule_id uuid references aio_control.schedules(id) on delete set null,
  run_id uuid references aio_control.runs(id) on delete set null,
  provider text not null,
  model text,
  triggered_by text,
  status text not null default 'done' check (status in ('done', 'failed')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents integer not null default 0,
  cost_eur numeric generated always as ((cost_cents::numeric / 100.0)) stored,
  latency_ms integer,
  error_text text,
  recorded_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'provider_usage_run_id_key'
      and conrelid = 'aio_control.provider_usage'::regclass
  ) then
    alter table aio_control.provider_usage
      add constraint provider_usage_run_id_key unique (run_id);
  end if;
end;
$$;

create index if not exists idx_provider_usage_workspace_recorded
  on aio_control.provider_usage(workspace_id, recorded_at desc);

create index if not exists idx_provider_usage_provider_recorded
  on aio_control.provider_usage(provider, recorded_at desc);

create index if not exists idx_provider_usage_business_recorded
  on aio_control.provider_usage(workspace_id, business_id, recorded_at desc)
  where business_id is not null;

alter table aio_control.provider_usage enable row level security;

drop policy if exists "provider_usage_select_member" on aio_control.provider_usage;
create policy "provider_usage_select_member"
  on aio_control.provider_usage for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "provider_usage_insert_editor" on aio_control.provider_usage;
create policy "provider_usage_insert_editor"
  on aio_control.provider_usage for insert
  with check (
    aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
    or auth.role() = 'service_role'
  );

drop policy if exists "provider_usage_update_editor" on aio_control.provider_usage;
create policy "provider_usage_update_editor"
  on aio_control.provider_usage for update
  using (
    aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
    or auth.role() = 'service_role'
  )
  with check (
    aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
    or auth.role() = 'service_role'
  );

create or replace view aio_control.provider_usage_dashboard as
select
  date_trunc('day', recorded_at) as day,
  workspace_id,
  business_id,
  provider,
  model,
  count(*) as calls,
  coalesce(sum(input_tokens), 0) as tokens_in,
  coalesce(sum(output_tokens), 0) as tokens_out,
  coalesce(sum(cost_cents), 0) as cost_cents,
  coalesce(sum(cost_eur), 0) as cost_eur,
  count(*) filter (where status = 'failed') as failed_calls
from aio_control.provider_usage
group by 1, 2, 3, 4, 5;

grant select, insert, update on aio_control.provider_usage to authenticated;
grant select on aio_control.provider_usage_dashboard to authenticated;
grant select, insert, update, delete on aio_control.provider_usage to service_role;
