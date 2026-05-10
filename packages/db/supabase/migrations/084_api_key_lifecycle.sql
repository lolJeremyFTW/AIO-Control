-- 084_api_key_lifecycle.sql
-- API key lifecycle metadata: safe preview, status, last-used tracking, and
-- budget/rate-limit hints. Plaintext stays inside pgcrypto functions.

alter table aio_control.api_keys
  add column if not exists key_preview text,
  add column if not exists status text not null default 'active',
  add column if not exists last_used_at timestamptz,
  add column if not exists last_validated_at timestamptz,
  add column if not exists validation_error text,
  add column if not exists monthly_cap_cents integer,
  add column if not exists daily_cap_cents integer,
  add column if not exists rpm_limit integer,
  add column if not exists tpm_limit integer,
  add column if not exists expires_at timestamptz,
  add column if not exists rotated_from uuid references aio_control.api_keys(id) on delete set null,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'api_keys_status_check'
      and conrelid = 'aio_control.api_keys'::regclass
  ) then
    alter table aio_control.api_keys
      add constraint api_keys_status_check
        check (status in ('active', 'revoked', 'expired', 'rate_limited'));
  end if;
end $$;

create index if not exists idx_api_keys_active_lookup
  on aio_control.api_keys(workspace_id, owner_user_id, provider, credential_type)
  where status = 'active';

create or replace function aio_control._api_key_preview(_value text)
returns text
language sql
immutable
as $$
  select case
    when _value is null or length(_value) = 0 then null
    when length(_value) <= 10 then repeat('*', greatest(length(_value) - 4, 0)) || right(_value, 4)
    else left(_value, 6) || '...' || right(_value, 4)
  end
$$;

drop view if exists aio_control.api_keys_metadata;

create view aio_control.api_keys_metadata
with (security_invoker = true) as
select
  id,
  workspace_id,
  owner_user_id,
  scope,
  scope_id,
  provider,
  label,
  (encrypted_value is not null) as has_value,
  key_preview,
  status,
  last_used_at,
  last_validated_at,
  validation_error,
  monthly_cap_cents,
  daily_cap_cents,
  rpm_limit,
  tpm_limit,
  expires_at,
  rotated_from,
  notes,
  created_by,
  created_at,
  updated_at,
  kind,
  credential_type
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
  key_preview,
  status,
  last_used_at,
  last_validated_at,
  validation_error,
  monthly_cap_cents,
  daily_cap_cents,
  rpm_limit,
  tpm_limit,
  expires_at,
  rotated_from,
  notes,
  created_by,
  created_at,
  updated_at,
  kind,
  credential_type
) on aio_control.api_keys to authenticated;

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
  _key_id uuid;
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
      select id, pgp_sym_decrypt(encrypted_value, _master_key) into _key_id, _value
      from aio_control.api_keys
      where workspace_id = _workspace_id
        and owner_user_id = _owner
        and scope = 'navnode'
        and scope_id = _ancestor
        and provider = _provider
        and credential_type = _credential_type
        and status = 'active'
        and (expires_at is null or expires_at > now());
      if _value is not null and _value != '' then
        update aio_control.api_keys set last_used_at = now() where id = _key_id;
        return _value;
      end if;
    end loop;
  end if;

  if _business_id is not null then
    select id, pgp_sym_decrypt(encrypted_value, _master_key) into _key_id, _value
    from aio_control.api_keys
    where workspace_id = _workspace_id
      and owner_user_id = _owner
      and scope = 'business'
      and scope_id = _business_id
      and provider = _provider
      and credential_type = _credential_type
      and status = 'active'
      and (expires_at is null or expires_at > now());
    if _value is not null and _value != '' then
      update aio_control.api_keys set last_used_at = now() where id = _key_id;
      return _value;
    end if;
  end if;

  select id, pgp_sym_decrypt(encrypted_value, _master_key) into _key_id, _value
  from aio_control.api_keys
  where workspace_id = _workspace_id
    and owner_user_id = _owner
    and scope = 'workspace'
    and scope_id = _workspace_id
    and provider = _provider
    and credential_type = _credential_type
    and status = 'active'
    and (expires_at is null or expires_at > now());
  if _value is not null and _value != '' then
    update aio_control.api_keys set last_used_at = now() where id = _key_id;
  end if;
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
     encrypted_value, key_preview, status, validation_error, label, created_by, updated_at)
  values
    (_workspace_id, _owner, _scope, _scope_id, _provider, _credential_type,
     pgp_sym_encrypt(_value, _master_key), aio_control._api_key_preview(_value),
     'active', null, _label, auth.uid(), now())
  on conflict (workspace_id, owner_user_id, scope, scope_id, provider, credential_type) do update
    set encrypted_value = excluded.encrypted_value,
        key_preview = excluded.key_preview,
        status = 'active',
        validation_error = null,
        label = coalesce(excluded.label, aio_control.api_keys.label),
        updated_at = now()
  returning id into _id;

  return _id;
end;
$$;

grant execute on function aio_control.resolve_api_key(uuid, uuid, uuid, text, text, uuid, text) to authenticated, service_role;
grant execute on function aio_control.set_api_key(uuid, text, uuid, text, text, text, text, text, uuid) to authenticated, service_role;
