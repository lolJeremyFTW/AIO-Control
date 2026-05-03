-- Migration 042 — persistent runtime agents in Hermes / OpenClaw.
--
-- Both Hermes-agent and OpenClaw support a "named agent" model: the
-- operator runs a one-off init command on the runtime host
-- (`hermes profile create <name>` or `openclaw agents add <name>`),
-- after which the runtime keeps long-lived per-agent state (memory,
-- session db, skills). Without this, AIO Control spawns the CLIs
-- per-turn with --session-id and the runtimes lose context-keeping
-- benefits the user is paying for.
--
-- This migration tracks the workspace's chosen agent name + when the
-- onboarding flow last verified it exists. The provider router uses
-- the name (when set) to switch from `hermes chat …` to
-- `<name> chat …` (Hermes wraps each profile in its own bin), and
-- from `openclaw agent --local …` to `openclaw agent <name> …`.
--
-- Idempotent (if-not-exists guards).

alter table aio_control.workspaces
  add column if not exists hermes_agent_name        text,
  add column if not exists hermes_agent_initialized_at  timestamptz,
  add column if not exists openclaw_agent_name      text,
  add column if not exists openclaw_agent_initialized_at timestamptz;

comment on column aio_control.workspaces.hermes_agent_name is
  'Name of the persistent Hermes profile this workspace uses (e.g. "aio-admin"). NULL = fall back to the bare `hermes chat` CLI.';
comment on column aio_control.workspaces.openclaw_agent_name is
  'Name of the persistent OpenClaw agent this workspace uses. NULL = fall back to `openclaw agent --local`.';
