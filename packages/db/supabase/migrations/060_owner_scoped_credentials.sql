-- 060_owner_scoped_credentials.sql
-- Make provider credentials owner-scoped and add OAuth-token support.
--
-- AIO Control is BYOK: every user can attach their own credentials inside a
-- workspace, and those credentials must never be used for another user. For
-- unattended runs, the application explicitly resolves the workspace owner's
-- credential.

alter table aio_control.api_keys
  add column if not exists owner_user_id uuid references aio_control.profiles(id) on delete cascade,
  add column if not exists credential_type text not null default 'api_key';

update aio_control.api_keys k
set owner_user_id = coalesce(k.created_by, w.owner_id)
from aio_control.workspaces w
where k.workspace_id = w.id
  and k.owner_user_id is null;

alter table aio_control.api_keys
  alter column owner_user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'api_keys_credential_type_check'
      and conrelid = 'aio_control.api_keys'::regclass
  ) then
    alter table aio_control.api_keys
      add constraint api_keys_credential_type_check
        check (credential_type in ('api_key', 'oauth_token'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'api_keys_workspace_id_scope_scope_id_provider_key'
      and conrelid = 'aio_control.api_keys'::regclass
  ) then
    alter table aio_control.api_keys
      drop constraint api_keys_workspace_id_scope_scope_id_provider_key;
  end if;
end $$;

create unique index if not exists api_keys_owner_scope_provider_unique
  on aio_control.api_keys(workspace_id, owner_user_id, scope, scope_id, provider, credential_type);

create index if not exists idx_api_keys_owner_lookup
  on aio_control.api_keys(workspace_id, owner_user_id, provider, credential_type);

drop policy if exists "api_keys_member_read" on aio_control.api_keys;
drop policy if exists "api_keys_editor_write" on aio_control.api_keys;
drop policy if exists "api_keys_owner_read" on aio_control.api_keys;
drop policy if exists "api_keys_owner_write" on aio_control.api_keys;

create policy "api_keys_owner_read" on aio_control.api_keys
  for select
  using (
    owner_user_id = auth.uid()
    and workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

create policy "api_keys_owner_write" on aio_control.api_keys
  for all
  using (
    owner_user_id = auth.uid()
    and workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  )
  with check (
    owner_user_id = auth.uid()
    and workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  );

drop view if exists aio_control.api_keys_metadata;

create view aio_control.api_keys_metadata
with (security_invoker = true) as
select id, workspace_id, owner_user_id, scope, scope_id, provider, label,
       (encrypted_value is not null) as has_value,
       created_by, created_at, updated_at,
       kind, credential_type
from aio_control.api_keys
where owner_user_id = auth.uid();

grant select on aio_control.api_keys_metadata to authenticated;

revoke select on table aio_control.api_keys from anon, authenticated;
grant select (
  id,
  workspace_id,
  owner_user_id,
  scope,
  scope_id,
  provider,
  label,
  created_by,
  created_at,
  updated_at,
  kind,
  credential_type
) on aio_control.api_keys to authenticated;

drop function if exists aio_control.resolve_api_key(uuid, uuid, uuid, text, text);
drop function if exists aio_control.set_api_key(uuid, text, uuid, text, text, text, text);

create or replace function aio_control.resolve_api_key(
  _workspace_id uuid,
  _business_id uuid,
  _nav_node_id uuid,
  _provider text,
  _master_key text,
  _owner_user_id uuid default null,
  _credential_type text default 'api_key'
) returns text
language plpgsql
security definer
set search_path = public, aio_control, extensions
as $$
declare
  _value text;
  _ancestor uuid;
  _owner uuid;
begin
  if auth.uid() is not null and not exists (
    select 1 from aio_control.workspace_members
    where workspace_id = _workspace_id and user_id = auth.uid()
  ) then
    return null;
  end if;

  if _owner_user_id is null then
    select owner_id into _owner from aio_control.workspaces where id = _workspace_id;
  else
    _owner := _owner_user_id;
  end if;

  if _owner is null then
    return null;
  end if;

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
        and owner_user_id = _owner
        and scope = 'navnode'
        and scope_id = _ancestor
        and provider = _provider
        and credential_type = _credential_type;
      if _value is not null and _value != '' then
        return _value;
      end if;
    end loop;
  end if;

  if _business_id is not null then
    select pgp_sym_decrypt(encrypted_value, _master_key) into _value
    from aio_control.api_keys
    where workspace_id = _workspace_id
      and owner_user_id = _owner
      and scope = 'business'
      and scope_id = _business_id
      and provider = _provider
      and credential_type = _credential_type;
    if _value is not null and _value != '' then
      return _value;
    end if;
  end if;

  select pgp_sym_decrypt(encrypted_value, _master_key) into _value
  from aio_control.api_keys
  where workspace_id = _workspace_id
    and owner_user_id = _owner
    and scope = 'workspace'
    and scope_id = _workspace_id
    and provider = _provider
    and credential_type = _credential_type;
  return _value;
end;
$$;

create or replace function aio_control.set_api_key(
  _workspace_id uuid,
  _scope text,
  _scope_id uuid,
  _provider text,
  _value text,
  _label text,
  _master_key text,
  _credential_type text default 'api_key',
  _owner_user_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, aio_control, extensions
as $$
declare
  _id uuid;
  _role text;
  _owner uuid;
begin
  if auth.uid() is not null then
    select role into _role
    from aio_control.workspace_members
    where workspace_id = _workspace_id and user_id = auth.uid();
    if _role is null or _role not in ('owner', 'admin', 'editor') then
      raise exception 'permission denied';
    end if;
  end if;

  _owner := coalesce(_owner_user_id, auth.uid());
  if _owner is null then
    raise exception 'missing credential owner';
  end if;
  if not exists (
    select 1 from aio_control.workspace_members
    where workspace_id = _workspace_id and user_id = _owner
  ) then
    raise exception 'credential owner is not a workspace member';
  end if;

  insert into aio_control.api_keys
    (workspace_id, owner_user_id, scope, scope_id, provider, credential_type,
     encrypted_value, label, created_by, updated_at)
  values
    (_workspace_id, _owner, _scope, _scope_id, _provider, _credential_type,
     pgp_sym_encrypt(_value, _master_key), _label, auth.uid(), now())
  on conflict (workspace_id, owner_user_id, scope, scope_id, provider, credential_type) do update
    set encrypted_value = excluded.encrypted_value,
        label = coalesce(excluded.label, aio_control.api_keys.label),
        updated_at = now()
  returning id into _id;

  return _id;
end;
$$;

grant execute on function aio_control.resolve_api_key(uuid, uuid, uuid, text, text, uuid, text) to authenticated, service_role;
grant execute on function aio_control.set_api_key(uuid, text, uuid, text, text, text, text, text, uuid) to authenticated, service_role;

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

  if auth.uid() is null then
    delete from aio_control.api_keys where id = _id;
    return true;
  end if;

  select role into _role
  from aio_control.workspace_members
  where workspace_id = _row.workspace_id and user_id = auth.uid();

  if _row.owner_user_id <> auth.uid() and _role <> 'owner' then
    raise exception 'permission denied';
  end if;

  delete from aio_control.api_keys where id = _id;
  return true;
end;
$$;

grant execute on function aio_control.delete_api_key(uuid) to authenticated, service_role;

comment on column aio_control.api_keys.owner_user_id is
  'Credential owner. Interactive requests resolve the current user; background requests resolve the workspace owner.';
comment on column aio_control.api_keys.credential_type is
  'api_key = opaque provider key, oauth_token = encrypted JSON OAuth token payload.';
