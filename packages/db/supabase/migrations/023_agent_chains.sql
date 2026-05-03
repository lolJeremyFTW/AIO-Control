-- 023_agent_chains.sql — chain agents together. When agent A runs
-- successfully, automatically queue agent B with A's output as input.
-- Optional separate "next on failure" path so you can route errors to
-- a triage agent.
--
-- Two columns instead of a separate workflow_steps table because most
-- chains are linear and we don't need a workflow editor yet — just
-- "after this, run that". A future migration can introduce
-- workflow_steps once branching gets common.

alter table aio_control.agents
  add column if not exists next_agent_on_done uuid
    references aio_control.agents(id) on delete set null,
  add column if not exists next_agent_on_fail uuid
    references aio_control.agents(id) on delete set null;
