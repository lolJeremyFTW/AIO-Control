-- 018_cost_views.sql — denormalised aggregation views the cost
-- dashboard reads. Cheap because we keep the indexes on runs and let
-- Postgres do the grouping at query-time; the view is just sugar.
--
-- Each view reports cost_cents over 24h / 7d / 30d windows + run
-- counts so the UI can render "spend per business" + "runs per
-- provider" without round-tripping per breakdown.

create or replace view aio_control.cost_by_business as
select
  r.workspace_id,
  r.business_id,
  count(*) filter (where r.created_at > now() - interval '24 hours') as runs_24h,
  count(*) filter (where r.created_at > now() - interval '7 days') as runs_7d,
  count(*) filter (where r.created_at > now() - interval '30 days') as runs_30d,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '24 hours'), 0) as cost_24h_cents,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '7 days'), 0) as cost_7d_cents,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '30 days'), 0) as cost_30d_cents,
  count(*) filter (where r.status = 'failed' and r.created_at > now() - interval '24 hours') as failed_24h
from aio_control.runs r
group by r.workspace_id, r.business_id;

create or replace view aio_control.cost_by_agent as
select
  r.workspace_id,
  r.agent_id,
  count(*) filter (where r.created_at > now() - interval '24 hours') as runs_24h,
  count(*) filter (where r.created_at > now() - interval '7 days') as runs_7d,
  count(*) filter (where r.created_at > now() - interval '30 days') as runs_30d,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '24 hours'), 0) as cost_24h_cents,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '7 days'), 0) as cost_7d_cents,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '30 days'), 0) as cost_30d_cents
from aio_control.runs r
where r.agent_id is not null
group by r.workspace_id, r.agent_id;

-- Per-provider view joins through agents.provider so we can show
-- "MiniMax cost vs Claude cost" without storing provider on runs.
create or replace view aio_control.cost_by_provider as
select
  a.workspace_id,
  a.provider,
  count(r.*) filter (where r.created_at > now() - interval '24 hours') as runs_24h,
  count(r.*) filter (where r.created_at > now() - interval '7 days') as runs_7d,
  count(r.*) filter (where r.created_at > now() - interval '30 days') as runs_30d,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '24 hours'), 0) as cost_24h_cents,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '7 days'), 0) as cost_7d_cents,
  coalesce(sum(r.cost_cents) filter (where r.created_at > now() - interval '30 days'), 0) as cost_30d_cents
from aio_control.agents a
left join aio_control.runs r on r.agent_id = a.id
group by a.workspace_id, a.provider;

-- Daily cost timeline for the last 30 days (used by the sparkline).
create or replace view aio_control.cost_timeline_30d as
select
  workspace_id,
  date_trunc('day', created_at)::date as day,
  count(*) as runs,
  coalesce(sum(cost_cents), 0) as cost_cents
from aio_control.runs
where created_at > now() - interval '30 days'
group by workspace_id, date_trunc('day', created_at)
order by day asc;

grant select on aio_control.cost_by_business to authenticated;
grant select on aio_control.cost_by_agent to authenticated;
grant select on aio_control.cost_by_provider to authenticated;
grant select on aio_control.cost_timeline_30d to authenticated;
