-- 001_init.sql — Phase 1: profiles, workspaces, members, audit logs,
-- handle_new_user trigger, and RLS policies. Idempotent: drops and recreates
-- objects so it can be re-run safely during early development.

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_letter text not null default 'U',
  avatar_variant text not null default 'orange',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_table text not null,
  resource_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_user
  on public.workspace_members(user_id);
create index if not exists idx_audit_logs_workspace_created
  on public.audit_logs(workspace_id, created_at desc);

-- ─── Helper: is the caller a member of <workspace_id>? ───────────────────────
-- SECURITY DEFINER so it can bypass RLS on workspace_members for the lookup.
-- The function only returns boolean; nothing leaks.
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(ws_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
  limit 1;
$$;

-- ─── Trigger: create profile + first workspace on auth.users INSERT ──────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
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

  insert into public.profiles (id, display_name, email, avatar_letter)
  values (new.id, display, new.email, letter);

  -- slugify the display name; fallback to "workspace-<short-id>".
  base_slug := lower(regexp_replace(display, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'workspace-' || substring(new.id::text, 1, 6);
  end if;

  unique_slug := base_slug;
  while exists (select 1 from public.workspaces where slug = unique_slug) loop
    attempt := attempt + 1;
    unique_slug := base_slug || '-' || attempt;
  end loop;

  insert into public.workspaces (slug, name, owner_id)
  values (unique_slug, 'Mijn workspace', new.id)
  returning id into workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Audit-log helper trigger ────────────────────────────────────────────────
-- Tables call this with workspace_id derivable from the row. Phase 2+ tables
-- will hook this up; phase 1 only audits workspaces and members.
create or replace function public._audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
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

  insert into public.audit_logs (workspace_id, actor_id, action, resource_table, resource_id, payload)
  values (ws_id, auth.uid(), TG_OP, TG_TABLE_NAME, rec_id, payload);

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_workspaces on public.workspaces;
create trigger trg_audit_workspaces
  after insert or update or delete on public.workspaces
  for each row execute function public._audit_row();

drop trigger if exists trg_audit_members on public.workspace_members;
create trigger trg_audit_members
  after insert or update or delete on public.workspace_members
  for each row execute function public._audit_row();

-- ─── Row-level security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: read self + co-workspace members; write self.
drop policy if exists "profiles_read_self_or_workspace_member" on public.profiles;
create policy "profiles_read_self_or_workspace_member"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.workspace_members m1
      join public.workspace_members m2
        on m1.workspace_id = m2.workspace_id
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.id
    )
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- profiles INSERT happens via the SECURITY DEFINER trigger; no client policy.

-- workspaces: read if member; insert by any authenticated user (they become
-- owner); update/delete by owner or admin.
drop policy if exists "workspaces_read_member" on public.workspaces;
create policy "workspaces_read_member"
  on public.workspaces for select
  using (public.is_workspace_member(id));

drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (auth.uid() = owner_id);

drop policy if exists "workspaces_update_owner_admin" on public.workspaces;
create policy "workspaces_update_owner_admin"
  on public.workspaces for update
  using (public.workspace_role(id) in ('owner', 'admin'))
  with check (public.workspace_role(id) in ('owner', 'admin'));

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
  on public.workspaces for delete
  using (public.workspace_role(id) = 'owner');

-- workspace_members: read if member of the workspace; insert/update/delete
-- limited to owner|admin (server actions handle invite flows).
drop policy if exists "members_read" on public.workspace_members;
create policy "members_read"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "members_insert_owner_admin" on public.workspace_members;
create policy "members_insert_owner_admin"
  on public.workspace_members for insert
  with check (
    -- self-insert via handle_new_user is done with security-definer trigger.
    public.workspace_role(workspace_id) in ('owner', 'admin')
  );

drop policy if exists "members_update_owner_admin" on public.workspace_members;
create policy "members_update_owner_admin"
  on public.workspace_members for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin'));

drop policy if exists "members_delete_owner_admin" on public.workspace_members;
create policy "members_delete_owner_admin"
  on public.workspace_members for delete
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

-- audit_logs: read if workspace member; insert is trigger-only (no client
-- policy permits inserts, so the table is effectively append-only via SECURITY
-- DEFINER triggers).
drop policy if exists "audit_read_member" on public.audit_logs;
create policy "audit_read_member"
  on public.audit_logs for select
  using (public.is_workspace_member(workspace_id));
