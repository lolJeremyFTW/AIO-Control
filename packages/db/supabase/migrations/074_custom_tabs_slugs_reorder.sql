-- 074_custom_tabs_slugs_reorder.sql - readable custom tab routes and ordering.

alter table aio_control.custom_tabs
  add column if not exists slug text;

with slug_source as (
  select
    id,
    coalesce(
      nullif(
        trim(both '-' from regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'tab'
    ) as base_slug,
    row_number() over (
      partition by
        workspace_id,
        case when nav_node_id is null then business_id else nav_node_id end,
        nav_node_id is null,
        coalesce(
          nullif(
            trim(both '-' from regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g')),
            ''
          ),
          'tab'
        )
      order by sort_order, created_at, id
    ) as duplicate_index
  from aio_control.custom_tabs
  where slug is null or slug = ''
)
update aio_control.custom_tabs tabs
set slug = case
  when slug_source.duplicate_index = 1 then left(slug_source.base_slug, 90)
  else left(slug_source.base_slug, 82) || '-' || slug_source.duplicate_index::text
end
from slug_source
where tabs.id = slug_source.id;

alter table aio_control.custom_tabs
  alter column slug set not null;

create unique index if not exists idx_custom_tabs_business_slug
  on aio_control.custom_tabs(workspace_id, business_id, slug)
  where nav_node_id is null;

create unique index if not exists idx_custom_tabs_nav_node_slug
  on aio_control.custom_tabs(workspace_id, nav_node_id, slug)
  where nav_node_id is not null;

drop policy if exists "custom_tabs_update" on aio_control.custom_tabs;
create policy "custom_tabs_update"
  on aio_control.custom_tabs for update
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
