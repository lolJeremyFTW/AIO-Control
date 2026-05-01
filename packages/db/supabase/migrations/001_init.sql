-- Schema isolation: this whole app lives in the aio_control schema so it
-- can share a self-hosted Supabase instance with other apps without risk of
-- table-name collisions. PostgREST exposes the schema via PGRST_DB_SCHEMAS.
create schema if not exists aio_control;
grant usage on schema aio_control to anon, authenticated, service_role;
alter default privileges in schema aio_control grant all on tables to service_role;
alter default privileges in schema aio_control grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema aio_control grant select on tables to anon;

-- 001_init.sql — Phase 1: profiles, workspaces, members, audit logs,
-- handle_new_user trigger, and RLS policies. Idempotent: drops and recreates
-- objects so it can be re-run safely during early development.

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists aio_control.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_letter text not null default 'U',
  avatar_variant text not null default 'orange',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists aio_control.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  owner_id uuid not null references aio_control.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists aio_control.workspace_members (
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  user_id uuid not null references aio_control.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists aio_control.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  actor_id uuid references aio_control.profiles(id) on delete set null,
  action text not null,
  resource_table text not null,
  resource_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_user
  on aio_control.workspace_members(user_id);
create index if not exists idx_audit_logs_workspace_created
  on aio_control.audit_logs(workspace_id, created_at desc);

-- ─── Helper: is the caller a member of <workspace_id>? ───────────────────────
-- SECURITY DEFINER so it can bypass RLS on workspace_members for the lookup.
-- The function only returns boolean; nothing leaks.
create or replace function aio_control.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
set search_path = aio_control
stable
as $$
  select exists (
    select 1 from aio_control.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

create or replace function aio_control.workspace_role(ws_id uuid)
returns text
language sql
security definer
set search_path = aio_control
stable
as $$
  select role from aio_control.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
  limit 1;
$$;

-- ─── Trigger: create profile + first workspace on auth.users INSERT ──────────
create or replace function aio_control.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = aio_control, auth
as $$
declare
  display text;
  letter  text;
  base_slug text;
  unique_slug text;
  workspace_id uuid;
  attempt int := 0;
begin
  display := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );
  letter := upper(substring(display from 1 for 1));

  insert into aio_control.profiles (id, display_name, email, avatar_letter)
  values (new.id, display, new.email, letter);

  -- slugify the display name; fallback to "workspace-<short-id>".
  base_slug := lower(regexp_replace(display, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'workspace-' || substring(new.id::text, 1, 6);
  end if;

  unique_slug := base_slug;
  while exists (select 1 from aio_control.workspaces where slug = unique_slug) loop
    attempt := attempt + 1;
    unique_slug := base_slug || '-' || attempt;
  end loop;

  insert into aio_control.workspaces (slug, name, owner_id)
  values (unique_slug, 'Mijn workspace', new.id)
  returning id into workspace_id;

  insert into aio_control.workspace_members (workspace_id, user_id, role)
  values (workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function aio_control.handle_new_user();

-- ─── Audit-log helper trigger ────────────────────────────────────────────────
-- Tables call this with workspace_id derivable from the row. Phase 2+ tables
-- will hook this up; phase 1 only audits workspaces and members.
create or replace function aio_control._audit_row()
returns trigger
language plpgsql
security definer
set search_path = aio_control
as $$
declare
  ws_id uuid;
  rec_id uuid;
  payload jsonb;
begin
  -- Each calling table specifies its workspace_id field via TG_ARGV[0].
  if TG_OP = 'DELETE' then
    payload := to_jsonb(old);
    rec_id := (old).id;
    ws_id := coalesce((old).workspace_id, (old).id);
  else
    payload := to_jsonb(new);
    rec_id := (new).id;
    ws_id := coalesce((new).workspace_id, (new).id);
  end if;

  insert into aio_control.audit_logs (workspace_id, actor_id, action, resource_table, resource_id, payload)
  values (ws_id, auth.uid(), TG_OP, TG_TABLE_NAME, rec_id, payload);

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_workspaces on aio_control.workspaces;
create trigger trg_audit_workspaces
  after insert or update or delete on aio_control.workspaces
  for each row execute function aio_control._audit_row();

drop trigger if exists trg_audit_members on aio_control.workspace_members;
create trigger trg_audit_members
  after insert or update or delete on aio_control.workspace_members
  for each row execute function aio_control._audit_row();

-- ─── Row-level security ──────────────────────────────────────────────────────
alter table aio_control.profiles enable row level security;
alter table aio_control.workspaces enable row level security;
alter table aio_control.workspace_members enable row level security;
alter table aio_control.audit_logs enable row level security;

-- profiles: read self + co-workspace members; write self.
drop policy if exists "profiles_read_self_or_workspace_member" on aio_control.profiles;
create policy "profiles_read_self_or_workspace_member"
  on aio_control.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from aio_control.workspace_members m1
      join aio_control.workspace_members m2
        on m1.workspace_id = m2.workspace_id
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.id
    )
  );

drop policy if exists "profiles_update_self" on aio_control.profiles;
create policy "profiles_update_self"
  on aio_control.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- profiles INSERT happens via the SECURITY DEFINER trigger; no client policy.

-- workspaces: read if member; insert by any authenticated user (they become
-- owner); update/delete by owner or admin.
drop policy if exists "workspaces_read_member" on aio_control.workspaces;
create policy "workspaces_read_member"
  on aio_control.workspaces for select
  using (aio_control.is_workspace_member(id));

drop policy if exists "workspaces_insert_authenticated" on aio_control.workspaces;
create policy "workspaces_insert_authenticated"
  on aio_control.workspaces for insert
  with check (auth.uid() = owner_id);

drop policy if exists "workspaces_update_owner_admin" on aio_control.workspaces;
create policy "workspaces_update_owner_admin"
  on aio_control.workspaces for update
  using (aio_control.workspace_role(id) in ('owner', 'admin'))
  with check (aio_control.workspace_role(id) in ('owner', 'admin'));

drop policy if exists "workspaces_delete_owner" on aio_control.workspaces;
create policy "workspaces_delete_owner"
  on aio_control.workspaces for delete
  using (aio_control.workspace_role(id) = 'owner');

-- workspace_members: read if member of the workspace; insert/update/delete
-- limited to owner|admin (server actions handle invite flows).
drop policy if exists "members_read" on aio_control.workspace_members;
create policy "members_read"
  on aio_control.workspace_members for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "members_insert_owner_admin" on aio_control.workspace_members;
create policy "members_insert_owner_admin"
  on aio_control.workspace_members for insert
  with check (
    -- self-insert via handle_new_user is done with security-definer trigger.
    aio_control.workspace_role(workspace_id) in ('owner', 'admin')
  );

drop policy if exists "members_update_owner_admin" on aio_control.workspace_members;
create policy "members_update_owner_admin"
  on aio_control.workspace_members for update
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin'));

drop policy if exists "members_delete_owner_admin" on aio_control.workspace_members;
create policy "members_delete_owner_admin"
  on aio_control.workspace_members for delete
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin'));

-- audit_logs: read if workspace member; insert is trigger-only (no client
-- policy permits inserts, so the table is effectively append-only via SECURITY
-- DEFINER triggers).
drop policy if exists "audit_read_member" on aio_control.audit_logs;
create policy "audit_read_member"
  on aio_control.audit_logs for select
  using (aio_control.is_workspace_member(workspace_id));
