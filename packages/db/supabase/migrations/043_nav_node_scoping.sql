-- Migration 043 — per-topic scoping for operational rows.
--
-- Until now agents / schedules / runs / queue_items were business-
-- scoped only. The new per-topic dashboards + routines need finer
-- granularity so an operator can park an agent under "Faceless YT >
-- Reels" instead of just "Faceless YT" — the topic page then renders
-- only that agent's metrics, while the parent business page rolls
-- everything up via a recursive CTE on nav_nodes.parent_id.
--
-- Adds nullable nav_node_id to all four tables (NULL = belongs to
-- the business as a whole, current behaviour) + a partial index per
-- table so the topic-scoped queries don't full-scan.
--
-- Idempotent (if-not-exists guards). No backfill — existing rows
-- stay business-scoped; only new rows are eligible for topic-pinning
-- through the right-click "Verplaats naar topic" UX.

alter table aio_control.agents
  add column if not exists nav_node_id uuid
    references aio_control.nav_nodes(id) on delete set null;

alter table aio_control.schedules
  add column if not exists nav_node_id uuid
    references aio_control.nav_nodes(id) on delete set null;

alter table aio_control.runs
  add column if not exists nav_node_id uuid
    references aio_control.nav_nodes(id) on delete set null;

alter table aio_control.queue_items
  add column if not exists nav_node_id uuid
    references aio_control.nav_nodes(id) on delete set null;

-- Partial indexes — most rows will have NULL nav_node_id (they belong
-- to the business as a whole), so a full b-tree on the column would
-- be wasteful. The `where nav_node_id is not null` filter keeps the
-- index tiny and fast for the topic-scoped lookups.
create index if not exists idx_agents_navnode
  on aio_control.agents (nav_node_id) where nav_node_id is not null;
create index if not exists idx_schedules_navnode
  on aio_control.schedules (nav_node_id) where nav_node_id is not null;
create index if not exists idx_runs_navnode
  on aio_control.runs (nav_node_id) where nav_node_id is not null;
create index if not exists idx_queue_navnode
  on aio_control.queue_items (nav_node_id) where nav_node_id is not null;

comment on column aio_control.agents.nav_node_id is
  'Optional pin to a topic. NULL = belongs to the business as a whole. Topic dashboards roll up via recursive nav_nodes.parent_id walk.';
comment on column aio_control.schedules.nav_node_id is
  'Optional pin to a topic. NULL = business-wide schedule.';
comment on column aio_control.runs.nav_node_id is
  'Topic this run is attributed to. Inherited from agent.nav_node_id at dispatch time when not set explicitly.';
comment on column aio_control.queue_items.nav_node_id is
  'Topic this queue item is attributed to. Same inheritance rule as runs.';

-- Helper function: given a root nav_node_id, return that id + all
-- descendants. Used by the topic-scoped dashboard / schedules / runs
-- queries when includeDescendants=true. SECURITY INVOKER so RLS on
-- nav_nodes still applies (caller must have read access to the tree).
create or replace function aio_control.descendant_nav_node_ids(_root uuid)
returns table (id uuid)
language sql
stable
as $$
  with recursive tree as (
    select n.id, n.parent_id
    from aio_control.nav_nodes n
    where n.id = _root
    union all
    select c.id, c.parent_id
    from aio_control.nav_nodes c
    join tree t on c.parent_id = t.id
    where c.archived_at is null
  )
  select id from tree;
$$;

grant execute on function aio_control.descendant_nav_node_ids(uuid)
  to authenticated;
