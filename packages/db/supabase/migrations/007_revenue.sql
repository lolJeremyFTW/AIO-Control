-- 007_revenue.sql — Phase 7a: revenue_events + a real KPI view that
-- aggregates runs.cost_cents and revenue_events.amount_cents per business.
--
-- Revenue rows are inserted by external integrations (Stripe webhook, Etsy
-- daily sync, YouTube AdSense daily pull, etc.). For phase 7a we ship the
-- table + view; the integrations land in phase 8 once we wire OAuth flows.

create table if not exists aio_control.revenue_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid not null references aio_control.businesses(id) on delete cascade,
  source text not null,
    -- stripe|etsy|youtube|fiverr|manual|...
  external_id text,
    -- provider's id for dedup (Stripe charge id, Etsy receipt id, ...)
  amount_cents integer not null,
  currency text not null default 'EUR',
  occurred_at timestamptz not null default now(),
  payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_revenue_events_dedup
  on aio_control.revenue_events(business_id, source, external_id)
  where external_id is not null;
create index if not exists idx_revenue_events_window
  on aio_control.revenue_events(business_id, occurred_at desc);

alter table aio_control.revenue_events enable row level security;

drop policy if exists "revenue_read_member" on aio_control.revenue_events;
create policy "revenue_read_member"
  on aio_control.revenue_events for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "revenue_write_admin" on aio_control.revenue_events;
create policy "revenue_write_admin"
  on aio_control.revenue_events for insert
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin'));
-- service_role bypasses RLS (Stripe/Etsy webhooks insert there).

drop trigger if exists trg_audit_revenue on aio_control.revenue_events;
create trigger trg_audit_revenue
  after insert or update or delete on aio_control.revenue_events
  for each row execute function aio_control._audit_row();

-- Replace the phase-2 stub view with a real aggregator that groups runs +
-- revenue events by business + period. The view is SECURITY INVOKER (the
-- default for views), so RLS on the underlying tables is enforced.
-- DROP first because the column shape changes (label → period, etc.).
drop view if exists aio_control.business_kpis_view;
create view aio_control.business_kpis_view as
with periods as (
  select b.id as business_id, b.workspace_id, '24H'::text as period,
         (now() - interval '24 hours') as since
  from aio_control.businesses b where b.archived_at is null
  union all
  select b.id, b.workspace_id, '7D', now() - interval '7 days'
  from aio_control.businesses b where b.archived_at is null
  union all
  select b.id, b.workspace_id, '30D', now() - interval '30 days'
  from aio_control.businesses b where b.archived_at is null
)
select
  p.business_id,
  p.workspace_id,
  p.period,
  coalesce(
    (select sum(r.cost_cents)
     from aio_control.runs r
     where r.business_id = p.business_id and r.created_at >= p.since), 0
  )::numeric / 100.0 as usage_eur,
  coalesce(
    (select sum(re.amount_cents)
     from aio_control.revenue_events re
     where re.business_id = p.business_id and re.occurred_at >= p.since), 0
  )::numeric / 100.0 as revenue_eur,
  coalesce(
    (select count(*)::int
     from aio_control.runs r
     where r.business_id = p.business_id and r.created_at >= p.since), 0
  ) as runs_count
from periods p;
