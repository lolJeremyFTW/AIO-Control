-- Migration 063 - business-scoped OpenClaw runtime agents.
--
-- Workspace-level OpenClaw agents keep shared state for the whole workspace.
-- These columns let a business opt into its own persistent OpenClaw agent,
-- while still falling back to workspaces.openclaw_agent_name when unset.

alter table aio_control.businesses
  add column if not exists openclaw_agent_name text,
  add column if not exists openclaw_agent_initialized_at timestamptz;

comment on column aio_control.businesses.openclaw_agent_name is
  'Optional persistent OpenClaw agent name for this business. NULL = use workspace.openclaw_agent_name.';
comment on column aio_control.businesses.openclaw_agent_initialized_at is
  'Last time AIO verified or created the business-scoped OpenClaw agent on the runtime host.';
