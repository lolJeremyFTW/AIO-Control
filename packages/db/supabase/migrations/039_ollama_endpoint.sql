-- Migration 039 — Ollama endpoint per workspace.
--
-- Lets the user point AIO Control at their own local Ollama (e.g.
-- http://localhost:11434 on the VPS, or http://192.168.0.42:11434 on
-- the LAN, or the Tailscale IP of their laptop). Stored on the
-- workspace so every Ollama-backed agent in the workspace agrees on
-- where to find the model server. The provider router falls back to
-- OLLAMA_BASE_URL env-var, and finally http://localhost:11434, when
-- these columns are NULL.
--
-- Idempotent: if-not-exists guards so re-running this migration on a
-- live DB is a no-op.

alter table aio_control.workspaces
  add column if not exists ollama_host text,
  add column if not exists ollama_port int,
  add column if not exists ollama_models_cached jsonb default '[]'::jsonb,
  add column if not exists ollama_last_scan_at timestamptz;

comment on column aio_control.workspaces.ollama_host is
  'Hostname or IP for the local Ollama server. Empty = use env-var fallback.';
comment on column aio_control.workspaces.ollama_port is
  'Port for the local Ollama server. Defaults to 11434 when host is set.';
comment on column aio_control.workspaces.ollama_models_cached is
  'Last scan result — array of {name, size, modified_at} so the picker has model names without re-hitting the network.';
comment on column aio_control.workspaces.ollama_last_scan_at is
  'When the model list was last refreshed via the "scan" button.';
