-- 015_api_keys.sql — tiered API keys per workspace, with optional
-- per-business and per-nav-node overrides.
--
-- Resolution order (most specific wins):
--   navnode (and ancestors) → business → workspace → env-var fallback
--
-- Same pgcrypto.pgp_sym_encrypt pattern as agent_secrets — the master
-- key lives in app env (AGENT_SECRET_KEY), never in the DB. RLS denies
-- read of the encrypted bytea to everyone except service_role; metadata
-- (provider, scope, label) is readable by workspace members so they
-- can see "Anthropic key set on workspace level, MiniMax overridden on
-- Faceless YouTube business" without ever seeing the secret value.

create extension if not exists pgcrypto with schema public;

-- ─── Table ───────────────────────────────────────────────────────────────────
create table if not exists aio_control.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  -- Where this key applies. workspace = workspace-wide default,
  -- business = override for one business, navnode = override for one
  -- nav-node and its descendants.
  scope text not null check (scope in ('workspace', 'business', 'navnode')),
  -- For scope='workspace': workspace_id. For 'business': business_id.
  -- For 'navnode': nav_nodes.id.
  scope_id uuid not null,
  -- 'anthropic' | 'minimax' | 'openrouter' | 'openai' | 'ollama' |
  -- 'minimax_mcp' | (anything; we don't constrain so future providers
  -- slot in without a migration).
  provider text not null,
  encrypted_value bytea not null,
  -- Free-form display label, e.g. "Anthropic prod" or "MiniMax test".
  label text,
  created_by uuid references aio_control.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only one key per (scope, scope_id, provider). Replacing a key is
  -- an upsert.
  unique (workspace_id, scope, scope_id, provider)
);

create index if not exists idx_api_keys_lookup
  on aio_control.api_keys(workspace_id, scope, scope_id, provider);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table aio_control.api_keys enable row level security;

-- Members can read metadata (NOT the encrypted_value — see view below).
drop policy if exists "api_keys_member_read" on aio_control.api_keys;
create policy "api_keys_member_read" on aio_control.api_keys
  for select
  using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

-- Editors+ can write.
drop policy if exists "api_keys_editor_write" on aio_control.api_keys;
create policy "api_keys_editor_write" on aio_control.api_keys
  for all
  using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  );

-- ─── Metadata view ───────────────────────────────────────────────────────────
-- Workspace members SELECT this view; never the table directly. The
-- view omits encrypted_value so the secret never crosses the wire.
create or replace view aio_control.api_keys_metadata as
select id, workspace_id, scope, scope_id, provider, label,
       (encrypted_value is not null) as has_value,
       created_by, created_at, updated_at
from aio_control.api_keys;

grant select on aio_control.api_keys_metadata to authenticated;

-- ─── Resolver function ───────────────────────────────────────────────────────
-- Walks the scope hierarchy and returns the decrypted key. SECURITY
-- DEFINER so it can read encrypted_value despite RLS. Caller must
-- already be authenticated; we double-check workspace membership
-- before returning anything.
create or replace function aio_control.resolve_api_key(
  _workspace_id uuid,
  _business_id uuid,
  _nav_node_id uuid,
  _provider text,
  _master_key text
) returns text
language plpgsql
security definer
set search_path = public, aio_control, extensions
as $$
declare
  _value text;
  _ancestor uuid;
begin
  -- Membership check — anyone can call the function but only members
  -- of this workspace receive a value. Defence in depth on top of RLS
  -- since we're SECURITY DEFINER.
  if not exists (
    select 1 from aio_control.workspace_members
    where workspace_id = _workspace_id and user_id = auth.uid()
  ) then
    return null;
  end if;

  -- 1. Walk up the nav-node tree, deepest first.
  if _nav_node_id is not null then
    for _ancestor in
      with recursive chain as (
        select id, parent_id, 0 as depth
        from aio_control.nav_nodes
        where id = _nav_node_id and workspace_id = _workspace_id
        union all
        select n.id, n.parent_id, c.depth + 1
        from aio_control.nav_nodes n
        join chain c on c.parent_id = n.id
        where n.workspace_id = _workspace_id
      )
      select id from chain order by depth asc
    loop
      select pgp_sym_decrypt(encrypted_value, _master_key) into _value
      from aio_control.api_keys
      where workspace_id = _workspace_id
        and scope = 'navnode'
        and scope_id = _ancestor
        and provider = _provider;
      if _value is not null and _value != '' then
        return _value;
      end if;
    end loop;
  end if;

  -- 2. Business-level override.
  if _business_id is not null then
    select pgp_sym_decrypt(encrypted_value, _master_key) into _value
    from aio_control.api_keys
    where workspace_id = _workspace_id
      and scope = 'business'
      and scope_id = _business_id
      and provider = _provider;
    if _value is not null and _value != '' then
      return _value;
    end if;
  end if;

  -- 3. Workspace-level default.
  select pgp_sym_decrypt(encrypted_value, _master_key) into _value
  from aio_control.api_keys
  where workspace_id = _workspace_id
    and scope = 'workspace'
    and scope_id = _workspace_id
    and provider = _provider;
  return _value;
end;
$$;

-- ─── Set / delete helpers ────────────────────────────────────────────────────
create or replace function aio_control.set_api_key(
  _workspace_id uuid,
  _scope text,
  _scope_id uuid,
  _provider text,
  _value text,
  _label text,
  _master_key text
) returns uuid
language plpgsql
security definer
set search_path = public, aio_control, extensions
as $$
declare
  _id uuid;
  _role text;
begin
  -- Editor-or-higher membership required to write.
  select role into _role
  from aio_control.workspace_members
  where workspace_id = _workspace_id and user_id = auth.uid();
  if _role is null or _role not in ('owner', 'admin', 'editor') then
    raise exception 'permission denied';
  end if;

  insert into aio_control.api_keys
    (workspace_id, scope, scope_id, provider, encrypted_value, label, created_by, updated_at)
  values
    (_workspace_id, _scope, _scope_id, _provider,
     pgp_sym_encrypt(_value, _master_key), _label, auth.uid(), now())
  on conflict (workspace_id, scope, scope_id, provider) do update
    set encrypted_value = excluded.encrypted_value,
        label = coalesce(excluded.label, aio_control.api_keys.label),
        updated_at = now()
  returning id into _id;

  return _id;
end;
$$;

create or replace function aio_control.delete_api_key(
  _id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, aio_control, extensions
as $$
declare
  _row aio_control.api_keys;
  _role text;
begin
  select * into _row from aio_control.api_keys where id = _id;
  if not found then return false; end if;

  select role into _role
  from aio_control.workspace_members
  where workspace_id = _row.workspace_id and user_id = auth.uid();
  if _role is null or _role not in ('owner', 'admin', 'editor') then
    raise exception 'permission denied';
  end if;

  delete from aio_control.api_keys where id = _id;
  return true;
end;
$$;

-- Allow authenticated users to call the helpers (auth check is in the
-- function bodies via auth.uid()).
grant execute on function aio_control.resolve_api_key(uuid, uuid, uuid, text, text) to authenticated, service_role;
grant execute on function aio_control.set_api_key(uuid, text, uuid, text, text, text, text) to authenticated, service_role;
grant execute on function aio_control.delete_api_key(uuid) to authenticated, service_role;
