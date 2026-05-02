-- 012_nav_nodes.sql — Phase 7+: a tree of nav nodes under a business.
-- Each business can have any number of children (topics), each topic
-- any number of children (modules), and so on — there's no level cap
-- in the schema, the rail UI handles arbitrary depth via parent_id
-- recursion.
--
-- Each node belongs to a workspace + a root business; parent_id tracks
-- the tree shape. A NULL parent_id means "direct child of the
-- business" (i.e. a top-level topic). Sort order is per-parent so the
-- UI can render siblings in user-defined order.
--
-- Why a separate table from businesses? Businesses own KPIs / runs /
-- queue / revenue — they're the "billing units" of the workspace.
-- Topics + deeper layers are pure navigation/structure; they hang
-- under a business but don't need their own KPI surface.

create table if not exists aio_control.nav_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid not null references aio_control.businesses(id) on delete cascade,
  parent_id uuid references aio_control.nav_nodes(id) on delete cascade,
  name text not null,
  sub text,
  letter text not null default 'T',
  variant text not null default 'slate',
  icon text,
  -- Optional external href — when set, clicking the node leaves the
  -- internal app and navigates to the URL. Use for absorbing existing
  -- Next.js apps as zones (lead-mgmt, YT content, YT intel, etc.).
  href text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nav_nodes_workspace_biz
  on aio_control.nav_nodes(workspace_id, business_id) where archived_at is null;
create index if not exists idx_nav_nodes_parent
  on aio_control.nav_nodes(parent_id) where archived_at is null;

drop trigger if exists trg_touch_nav_nodes on aio_control.nav_nodes;
create trigger trg_touch_nav_nodes
  before update on aio_control.nav_nodes
  for each row execute function aio_control._touch_updated_at();

drop trigger if exists trg_audit_nav_nodes on aio_control.nav_nodes;
create trigger trg_audit_nav_nodes
  after insert or update or delete on aio_control.nav_nodes
  for each row execute function aio_control._audit_row();

alter table aio_control.nav_nodes enable row level security;

drop policy if exists "nav_nodes_read_member" on aio_control.nav_nodes;
create policy "nav_nodes_read_member"
  on aio_control.nav_nodes for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "nav_nodes_write_editor" on aio_control.nav_nodes;
create policy "nav_nodes_write_editor"
  on aio_control.nav_nodes for insert
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "nav_nodes_update_editor" on aio_control.nav_nodes;
create policy "nav_nodes_update_editor"
  on aio_control.nav_nodes for update
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "nav_nodes_delete_editor" on aio_control.nav_nodes;
create policy "nav_nodes_delete_editor"
  on aio_control.nav_nodes for delete
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
