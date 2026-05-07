-- 052_custom_tabs_nav_node.sql — Add nav_node_id to custom_tabs so tabs
-- can be scoped to a topic instead of (or in addition to) a business.

alter table aio_control.custom_tabs
  add column if not exists nav_node_id uuid
    references aio_control.nav_nodes(id) on delete cascade;

create index if not exists idx_custom_tabs_nav_node
  on aio_control.custom_tabs(nav_node_id);
