-- 047_module_dashboards.sql — Phase 2 AI dashboards.
-- One saved dashboard per nav_node. When the GenerateDashboardCard agent
-- run completes, the user can persist its output here — the module page
-- then renders it as a live markdown report above the generate card.
--
-- UNIQUE on nav_node_id: upsert pattern, old dashboard replaced on re-gen.
-- run_id links back to the source run so we can show "based on run X" and
-- let the user click through to the original streaming transcript.

create table if not exists aio_control.module_dashboards (
  id uuid primary key default gen_random_uuid(),
  nav_node_id uuid not null unique references aio_control.nav_nodes(id) on delete cascade,
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  -- The saved markdown content (assistant output from the run).
  content text not null,
  -- Which run produced this dashboard (nullable — set null on run delete).
  run_id uuid references aio_control.runs(id) on delete set null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_dashboards_workspace
  on aio_control.module_dashboards(workspace_id);

drop trigger if exists trg_touch_module_dashboards on aio_control.module_dashboards;
create trigger trg_touch_module_dashboards
  before update on aio_control.module_dashboards
  for each row execute function aio_control._touch_updated_at();

alter table aio_control.module_dashboards enable row level security;

drop policy if exists "module_dashboards_read" on aio_control.module_dashboards;
create policy "module_dashboards_read"
  on aio_control.module_dashboards for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "module_dashboards_write" on aio_control.module_dashboards;
create policy "module_dashboards_write"
  on aio_control.module_dashboards for insert
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "module_dashboards_update" on aio_control.module_dashboards;
create policy "module_dashboards_update"
  on aio_control.module_dashboards for update
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "module_dashboards_delete" on aio_control.module_dashboards;
create policy "module_dashboards_delete"
  on aio_control.module_dashboards for delete
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
