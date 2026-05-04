-- 043_resolve_api_key_service_role.sql
-- Allow background dispatchers (cron-scheduler, webhook handlers) to
-- call resolve_api_key without a user JWT. The function gates access
-- via the master_key parameter + SECURITY DEFINER context already; the
-- workspace_members check was a defence-in-depth that broke service-
-- role callers (auth.uid() returns NULL → check fails → return NULL).
-- We now skip the membership check when there's no logged-in user.

CREATE OR REPLACE FUNCTION aio_control.resolve_api_key(
  _workspace_id uuid,
  _business_id uuid,
  _nav_node_id uuid,
  _provider text,
  _master_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'aio_control', 'extensions'
AS $function$
declare
  _value text;
  _ancestor uuid;
begin
  if auth.uid() is not null and not exists (
    select 1 from aio_control.workspace_members
    where workspace_id = _workspace_id and user_id = auth.uid()
  ) then
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
        and scope = 'navnode'
        and scope_id = _ancestor
        and provider = _provider;
      if _value is not null and _value != '' then
        return _value;
      end if;
    end loop;
  end if;

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

  select pgp_sym_decrypt(encrypted_value, _master_key) into _value
  from aio_control.api_keys
  where workspace_id = _workspace_id
    and scope = 'workspace'
    and scope_id = _workspace_id
    and provider = _provider;
  return _value;
end;
$function$;
