-- Migration 040 — Hermes + OpenClaw endpoints per workspace.
--
-- Mirrors the Ollama columns from migration 039: each self-hosted
-- provider gets a workspace-level URL + a "last successful test" stamp
-- so the Providers settings page can show a green checkmark next to a
-- card when the user has actually wired the provider up.
--
-- Idempotent (if-not-exists guards).

alter table aio_control.workspaces
  add column if not exists hermes_endpoint text,
  add column if not exists hermes_last_test_at timestamptz,
  add column if not exists openclaw_endpoint text,
  add column if not exists openclaw_last_test_at timestamptz;

comment on column aio_control.workspaces.hermes_endpoint is
  'Hermes-agent server URL (e.g. http://192.168.0.42:8080). Empty = use HERMES_BASE_URL env-var.';
comment on column aio_control.workspaces.hermes_last_test_at is
  'Last time the user ran the Test connection action successfully.';
comment on column aio_control.workspaces.openclaw_endpoint is
  'OpenClaw daemon URL (e.g. http://localhost:9001). Empty = use OPENCLAW_BASE_URL env-var.';
comment on column aio_control.workspaces.openclaw_last_test_at is
  'Last time the user ran the Test connection action successfully.';
