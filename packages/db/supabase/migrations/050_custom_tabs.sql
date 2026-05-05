-- 050_custom_tabs.sql — User-defined iframe tabs per business (or topic).
-- Shows up in the BusinessTabs nav as extra tabs after the built-ins.
-- Each tab embeds an external URL in an iframe.

create table if not exists aio_control.custom_tabs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete cascade,
  label text not null,
  url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_custom_tabs_business
  on aio_control.custom_tabs(business_id);

alter table aio_control.custom_tabs enable row level security;

drop policy if exists "custom_tabs_read" on aio_control.custom_tabs;
create policy "custom_tabs_read"
  on aio_control.custom_tabs for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "custom_tabs_write" on aio_control.custom_tabs;
create policy "custom_tabs_write"
  on aio_control.custom_tabs for insert
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "custom_tabs_delete" on aio_control.custom_tabs;
create policy "custom_tabs_delete"
  on aio_control.custom_tabs for delete
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
