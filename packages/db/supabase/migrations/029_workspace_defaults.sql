-- 029_workspace_defaults.sql — workspace-level defaults that flow
-- into every new agent unless the user picks something else. The
-- override hierarchy at run-time is unchanged:
--   agent.provider/model > business override > workspace default

alter table aio_control.workspaces
  add column if not exists default_provider text,
  add column if not exists default_model text,
  add column if not exists default_system_prompt text;
