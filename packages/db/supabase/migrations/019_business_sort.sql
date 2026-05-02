-- 019_business_sort.sql — let users reorder businesses in the rail
-- via drag-and-drop. We backfill the column from created_at so the
-- existing order is preserved.

alter table aio_control.businesses
  add column if not exists sort_order integer not null default 0;

-- Backfill: position by created_at so old businesses keep their
-- relative order. We use row_number() per workspace * 10 so there's
-- room to insert new rows between existing ones without renumbering.
with ranked as (
  select id,
         row_number() over (
           partition by workspace_id
           order by created_at asc
         ) * 10 as rn
  from aio_control.businesses
)
update aio_control.businesses b
set sort_order = ranked.rn
from ranked
where ranked.id = b.id;

create index if not exists idx_businesses_workspace_sort
  on aio_control.businesses(workspace_id, sort_order asc);
