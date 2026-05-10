-- 083_backfill_provider_usage.sql
-- Seed the provider usage ledger from historical terminal runs and make the
-- provider breakdown read from that ledger.

insert into aio_control.provider_usage (
  workspace_id,
  business_id,
  nav_node_id,
  agent_id,
  schedule_id,
  run_id,
  provider,
  model,
  triggered_by,
  status,
  input_tokens,
  output_tokens,
  cost_cents,
  latency_ms,
  error_text,
  recorded_at
)
select
  r.workspace_id,
  r.business_id,
  r.nav_node_id,
  r.agent_id,
  r.schedule_id,
  r.id,
  coalesce(a.provider, 'unknown') as provider,
  a.model,
  r.triggered_by,
  case when r.status = 'failed' then 'failed' else 'done' end as status,
  coalesce(r.input_tokens, 0),
  coalesce(r.output_tokens, 0),
  coalesce(r.cost_cents, 0),
  r.duration_ms,
  r.error_text,
  coalesce(r.ended_at, r.created_at)
from aio_control.runs r
left join aio_control.agents a on a.id = r.agent_id
where r.status in ('done', 'failed')
on conflict (run_id) do update
set
  workspace_id = excluded.workspace_id,
  business_id = excluded.business_id,
  nav_node_id = excluded.nav_node_id,
  agent_id = excluded.agent_id,
  schedule_id = excluded.schedule_id,
  provider = excluded.provider,
  model = excluded.model,
  triggered_by = excluded.triggered_by,
  status = excluded.status,
  input_tokens = excluded.input_tokens,
  output_tokens = excluded.output_tokens,
  cost_cents = excluded.cost_cents,
  latency_ms = excluded.latency_ms,
  error_text = excluded.error_text,
  recorded_at = excluded.recorded_at;

-- Keep the existing dashboard contract, but source provider totals from the
-- provider_usage ledger. This preserves the UI while making provider spend
-- reconcilable and stable even if an agent changes provider later.
create or replace view aio_control.cost_by_provider as
select
  u.workspace_id,
  u.provider,
  count(*) filter (where u.recorded_at > now() - interval '24 hours') as runs_24h,
  count(*) filter (where u.recorded_at > now() - interval '7 days') as runs_7d,
  count(*) filter (where u.recorded_at > now() - interval '30 days') as runs_30d,
  coalesce(sum(u.cost_cents) filter (where u.recorded_at > now() - interval '24 hours'), 0) as cost_24h_cents,
  coalesce(sum(u.cost_cents) filter (where u.recorded_at > now() - interval '7 days'), 0) as cost_7d_cents,
  coalesce(sum(u.cost_cents) filter (where u.recorded_at > now() - interval '30 days'), 0) as cost_30d_cents
from aio_control.provider_usage u
group by u.workspace_id, u.provider;

grant select on aio_control.cost_by_provider to authenticated;
