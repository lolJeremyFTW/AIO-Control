-- 037_agent_tools.sql — let an agent declare which AIO Control
-- function-tools it's allowed to call. Drives the chat-route's
-- tool-dispatch loop (workstream H).
--
--   null         use the default set for the agent's kind (see
--                packages/ai/src/aio-tools.ts → defaultToolsForKind).
--   text[]       explicit allow-list; only these tool names are
--                exposed to the agent on each turn.
--
-- We don't validate names against a SQL enum because the registry
-- evolves in app code. Unknown tool names just get filtered out at
-- dispatch time — no row breaks.

alter table aio_control.agents
  add column if not exists allowed_tools text[];

-- Helpful when the chat route loads the agent for a tool-dispatch
-- decision. Tiny index but pays off when there are 100s of agents.
create index if not exists idx_agents_allowed_tools_present
  on aio_control.agents(id) where allowed_tools is not null;
