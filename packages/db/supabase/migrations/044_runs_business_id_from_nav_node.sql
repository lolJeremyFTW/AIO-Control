-- 044_runs_business_id_from_nav_node.sql
-- Cost roll-up fix: when a run row is inserted with nav_node_id but
-- business_id NULL, the per-business aggregations (business_kpis_view,
-- AgentsDashboard's perBiz reduce) don't pick it up because they
-- filter on r.business_id = b.id directly. Result: a run on a topic
-- shows up on the topic dashboard (€0.03) but the parent business
-- header reports €0.00 because that run has no business_id.
--
-- Fix: a BEFORE INSERT/UPDATE trigger that fills business_id from
-- nav_nodes when it's NULL but nav_node_id is set. Plus a one-time
-- backfill of existing rows so historical runs roll up correctly.

create or replace function aio_control._runs_fill_business_from_navnode()
returns trigger
language plpgsql
as $$
begin
  if new.business_id is null and new.nav_node_id is not null then
    select n.business_id
      into new.business_id
      from aio_control.nav_nodes n
     where n.id = new.nav_node_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_runs_fill_business
  on aio_control.runs;

create trigger trg_runs_fill_business
  before insert or update of nav_node_id, business_id
  on aio_control.runs
  for each row
  execute function aio_control._runs_fill_business_from_navnode();

-- Backfill existing rows. Only touches rows where business_id is
-- genuinely missing — leaves the rest alone so we don't churn the
-- audit log unnecessarily.
update aio_control.runs r
   set business_id = n.business_id
  from aio_control.nav_nodes n
 where r.business_id is null
   and r.nav_node_id is not null
   and r.nav_node_id = n.id
   and n.business_id is not null;
