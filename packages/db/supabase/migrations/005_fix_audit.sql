-- 005_fix_audit.sql — Fix the _audit_row helper so it works on rows that
-- DON'T have a workspace_id column (notably the workspaces table itself,
-- where the workspace id IS the row id).
--
-- The previous version referenced (new).workspace_id directly, which the
-- plpgsql executor type-checks at run time against the actual record. On
-- workspaces it raised "column workspace_id not found in data type
-- workspaces", which surfaced through GoTrue as the misleading
-- "Database error saving new user" because handle_new_user's INSERT into
-- aio_control.workspaces fired the trigger.
--
-- Fix: extract fields via to_jsonb so the lookup is type-agnostic.

create or replace function aio_control._audit_row()
returns trigger
language plpgsql
security definer
set search_path = aio_control
as $$
declare
  rec jsonb;
  ws_id uuid;
  rec_id uuid;
begin
  if TG_OP = 'DELETE' then
    rec := to_jsonb(old);
  else
    rec := to_jsonb(new);
  end if;

  ws_id := coalesce(
    nullif(rec ->> 'workspace_id', '')::uuid,
    nullif(rec ->> 'id', '')::uuid
  );
  rec_id := nullif(rec ->> 'id', '')::uuid;

  if ws_id is not null then
    insert into aio_control.audit_logs (
      workspace_id, actor_id, action, resource_table, resource_id, payload
    ) values (
      ws_id, auth.uid(), TG_OP, TG_TABLE_NAME, rec_id, rec
    );
  end if;

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
