-- 047_api_keys_column_privileges.sql
-- Keep API key metadata available while preventing client-side reads of
-- api_keys.encrypted_value. RLS scopes rows, but column privileges are the
-- layer that prevents ciphertext from crossing PostgREST.

revoke select on table aio_control.api_keys from anon, authenticated;

grant select (
  id,
  workspace_id,
  scope,
  scope_id,
  provider,
  label,
  created_by,
  created_at,
  updated_at,
  kind
) on aio_control.api_keys to authenticated;

grant select on aio_control.api_keys_metadata to authenticated;

comment on column aio_control.api_keys.encrypted_value is
  'Ciphertext only. Do not grant SELECT on this column to anon/authenticated clients; use api_keys_metadata for UI reads and resolve_api_key via trusted server code for plaintext.';
