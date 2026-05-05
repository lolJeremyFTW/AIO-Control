-- 047_agent_teams.sql — Agent teams / hierarchies.
--
-- A "team" is a group of agents where one agent (kind='router') is the
-- coordinator and dispatches tasks to specialist subagents. Subagents
-- reference their team lead via parent_agent_id.
--
-- The dispatcher (dispatchRun) already handles chaining via
-- next_agent_on_done / next_agent_on_fail. Teams extend this with
-- dynamic dispatch: the coordinator calls the dispatch_agent AIO tool
-- at runtime, choosing WHICH subagent gets a task based on its content.
--
-- NULL parent_agent_id = standalone agent (no team, existing behaviour).

alter table aio_control.agents
  add column if not exists parent_agent_id uuid
    references aio_control.agents(id) on delete set null;

-- Fast lookup: "which agents are in team X?"
create index if not exists idx_agents_parent_agent_id
  on aio_control.agents(parent_agent_id)
  where parent_agent_id is not null;
