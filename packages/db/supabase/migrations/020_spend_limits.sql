-- 020_spend_limits.sql — workspace-level + per-business spend caps.
-- The dispatcher reads cost_24h_cents / cost_30d_cents from the
-- existing cost_by_business view and blocks new runs when either
-- limit would be exceeded.
--
-- All limits stored in cents (matches runs.cost_cents). NULL = no
-- limit at that level. Resolution order: business → workspace.

alter table aio_control.workspaces
  add column if not exists daily_spend_limit_cents integer,
  add column if not exists monthly_spend_limit_cents integer,
  add column if not exists auto_pause_on_limit boolean not null default true;

alter table aio_control.businesses
  add column if not exists daily_spend_limit_cents integer,
  add column if not exists monthly_spend_limit_cents integer;

-- Aggregate view: returns the resolved limits + current spend per
-- business. Makes the dispatcher's check a single SELECT.
create or replace view aio_control.spend_limit_state as
select
  b.id as business_id,
  b.workspace_id,
  b.status,
  -- resolved (business overrides workspace)
  coalesce(b.daily_spend_limit_cents, w.daily_spend_limit_cents) as daily_limit_cents,
  coalesce(b.monthly_spend_limit_cents, w.monthly_spend_limit_cents) as monthly_limit_cents,
  -- current usage in same window the limit checks against
  coalesce(c.cost_24h_cents, 0) as cost_24h_cents,
  coalesce(c.cost_30d_cents, 0) as cost_30d_cents,
  w.auto_pause_on_limit
from aio_control.businesses b
join aio_control.workspaces w on w.id = b.workspace_id
left join aio_control.cost_by_business c on c.business_id = b.id;

grant select on aio_control.spend_limit_state to authenticated;
