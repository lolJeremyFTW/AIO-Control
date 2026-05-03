-- 025_marketplace_source.sql — track WHERE each marketplace item came
-- from, so the admin page (and the share landing page) can render
-- "imported from github.com/owner/repo" with a clickable link.
--
-- We also bump the marketplace_kind constraint to include the
-- existing 'agent' / 'skill' / 'plugin' / 'mcp_server' kinds + a new
-- 'preset' bucket for prompt-only templates that aren't agents.

alter table aio_control.marketplace_agents
  add column if not exists source_url text,
  add column if not exists source_provider text,
  add column if not exists imported_at timestamptz,
  add column if not exists imported_by uuid references aio_control.profiles(id) on delete set null;

create index if not exists idx_marketplace_source
  on aio_control.marketplace_agents(source_provider, slug);
