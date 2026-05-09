-- 076_schedule_references.sql - per-routine reference files.
-- Schedules can now carry compact markdown reference files (for example
-- references/search-queries.md) that are appended to the run prompt at
-- dispatch time. This keeps the main instruction small while letting
-- operators maintain query lists, examples, and failure playbooks in AIO.

create table if not exists aio_control.schedule_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  schedule_id uuid not null references aio_control.schedules(id) on delete cascade,
  path text not null,
  content text not null,
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, path),
  check (char_length(path) between 1 and 160),
  check (path !~ '(^/|\\.\\.|\\\\)'),
  check (char_length(content) <= 20000)
);

create index if not exists idx_schedule_references_schedule
  on aio_control.schedule_references(schedule_id, sort_order, path);

create index if not exists idx_schedule_references_workspace
  on aio_control.schedule_references(workspace_id, schedule_id);

create or replace function aio_control._schedule_references_enforce_scope()
returns trigger
language plpgsql
as $$
declare
  schedule_workspace uuid;
begin
  select s.workspace_id
    into schedule_workspace
    from aio_control.schedules s
   where s.id = new.schedule_id;

  if schedule_workspace is null then
    raise exception 'schedule_references schedule_id does not reference a schedule';
  end if;

  new.workspace_id := schedule_workspace;
  return new;
end;
$$;

drop trigger if exists trg_schedule_references_enforce_scope
  on aio_control.schedule_references;
create trigger trg_schedule_references_enforce_scope
  before insert or update of schedule_id, workspace_id
  on aio_control.schedule_references
  for each row execute function aio_control._schedule_references_enforce_scope();

alter table aio_control.schedule_references enable row level security;

drop policy if exists "schedule_references_select_member"
  on aio_control.schedule_references;
create policy "schedule_references_select_member"
  on aio_control.schedule_references for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "schedule_references_write_editor"
  on aio_control.schedule_references;
create policy "schedule_references_write_editor"
  on aio_control.schedule_references for all
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop trigger if exists trg_touch_schedule_references
  on aio_control.schedule_references;
create trigger trg_touch_schedule_references
  before update on aio_control.schedule_references
  for each row execute function aio_control._touch_updated_at();

drop trigger if exists trg_audit_schedule_references
  on aio_control.schedule_references;
create trigger trg_audit_schedule_references
  after insert or update or delete on aio_control.schedule_references
  for each row execute function aio_control._audit_row();

grant select, insert, update, delete on aio_control.schedule_references to authenticated;
grant select, insert, update, delete on aio_control.schedule_references to service_role;
