-- 077_writing_styles.sql - reusable Claude-like writing styles for agents.
--
-- Writing styles are workspace-scoped style guides. Agents can point to
-- one style via agents.writing_style_id; the system-prompt builder injects
-- the style into chat, voice, cron, webhook, and manual runs.

create table if not exists aio_control.writing_styles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  name text not null,
  description text,
  instructions text not null,
  sample_text text,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name),
  check (char_length(name) between 1 and 80),
  check (char_length(instructions) between 1 and 12000),
  check (sample_text is null or char_length(sample_text) <= 12000)
);

create index if not exists idx_writing_styles_workspace
  on aio_control.writing_styles(workspace_id, name)
  where archived_at is null;

alter table aio_control.writing_styles enable row level security;

drop policy if exists "writing_styles_select_member"
  on aio_control.writing_styles;
create policy "writing_styles_select_member"
  on aio_control.writing_styles for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "writing_styles_write_editor"
  on aio_control.writing_styles;
create policy "writing_styles_write_editor"
  on aio_control.writing_styles for all
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop trigger if exists trg_touch_writing_styles
  on aio_control.writing_styles;
create trigger trg_touch_writing_styles
  before update on aio_control.writing_styles
  for each row execute function aio_control._touch_updated_at();

drop trigger if exists trg_audit_writing_styles
  on aio_control.writing_styles;
create trigger trg_audit_writing_styles
  after insert or update or delete on aio_control.writing_styles
  for each row execute function aio_control._audit_row();

alter table aio_control.agents
  add column if not exists writing_style_id uuid references aio_control.writing_styles(id) on delete set null;

create index if not exists idx_agents_writing_style
  on aio_control.agents(writing_style_id)
  where writing_style_id is not null;

create or replace function aio_control._agents_enforce_writing_style_scope()
returns trigger
language plpgsql
as $$
declare
  style_workspace uuid;
begin
  if new.writing_style_id is null then
    return new;
  end if;

  select ws.workspace_id
    into style_workspace
    from aio_control.writing_styles ws
   where ws.id = new.writing_style_id
     and ws.archived_at is null;

  if style_workspace is null then
    raise exception 'agents writing_style_id does not reference an active writing style';
  end if;

  if style_workspace <> new.workspace_id then
    raise exception 'agents writing_style_id must belong to the same workspace';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agents_enforce_writing_style_scope
  on aio_control.agents;
create trigger trg_agents_enforce_writing_style_scope
  before insert or update of workspace_id, writing_style_id
  on aio_control.agents
  for each row execute function aio_control._agents_enforce_writing_style_scope();

grant select, insert, update, delete on aio_control.writing_styles to authenticated;
grant select, insert, update, delete on aio_control.writing_styles to service_role;
