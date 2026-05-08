-- 070_improvements_self_healing.sql
-- Make self-improvement proposals safe for agents/server actions even when a
-- fresh environment has not applied the original table migration yet.

create or replace function aio_control.ensure_improvements_table()
returns void
language plpgsql
security definer
set search_path = aio_control, public
as $$
begin
  create table if not exists aio_control.improvements (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
    title text not null,
    description text not null,
    status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'built')),
    created_at timestamptz not null default now(),
    approved_at timestamptz,
    built_at timestamptz,
    built_by text,
    built_notes text,
    sort_order integer not null default 0
  );

  alter table aio_control.improvements enable row level security;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'aio_control'
      and tablename = 'improvements'
      and policyname = 'workspace members can read improvements'
  ) then
    create policy "workspace members can read improvements"
      on aio_control.improvements for select
      using (workspace_id in (
        select w.id from aio_control.workspaces w
        join aio_control.workspace_members wm on wm.workspace_id = w.id
        where wm.user_id = auth.uid()
      ));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'aio_control'
      and tablename = 'improvements'
      and policyname = 'workspace editors can create improvements'
  ) then
    create policy "workspace editors can create improvements"
      on aio_control.improvements for insert
      with check (
        aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'aio_control'
      and tablename = 'improvements'
      and policyname = 'workspace editors can update improvements'
  ) then
    create policy "workspace editors can update improvements"
      on aio_control.improvements for update
      using (
        aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
        or auth.role() = 'service_role'
      )
      with check (
        aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'aio_control'
      and tablename = 'improvements'
      and policyname = 'workspace editors can delete improvements'
  ) then
    create policy "workspace editors can delete improvements"
      on aio_control.improvements for delete
      using (
        aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
        or auth.role() = 'service_role'
      );
  end if;

  create index if not exists idx_improvements_workspace_status
    on aio_control.improvements(workspace_id, status, sort_order);

  grant select on aio_control.improvements to anon;
  grant select, insert, update, delete on aio_control.improvements to authenticated;
  grant select, insert, update, delete on aio_control.improvements to service_role;
  grant execute on function aio_control.ensure_improvements_table() to authenticated, service_role;

  -- Compatibility for raw Supabase REST calls that do not set
  -- Accept-Profile/Content-Profile: aio_control. security_invoker keeps RLS
  -- and table grants on aio_control.improvements in force.
  create or replace view public.improvements
    with (security_invoker = true)
    as
      select
        id,
        workspace_id,
        title,
        description,
        status,
        created_at,
        approved_at,
        built_at,
        built_by,
        built_notes,
        sort_order
      from aio_control.improvements;

  grant select on public.improvements to anon;
  grant select, insert, update, delete on public.improvements to authenticated;
  grant select, insert, update, delete on public.improvements to service_role;

  perform pg_notify('pgrst', 'reload schema');
end;
$$;

grant execute on function aio_control.ensure_improvements_table() to authenticated, service_role;

select aio_control.ensure_improvements_table();
