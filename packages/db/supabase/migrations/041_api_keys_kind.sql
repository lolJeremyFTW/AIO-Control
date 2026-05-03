-- Migration 041 — distinguish provider keys from user-defined custom secrets.
--
-- The api_keys table's `provider` column has always been free-text, so
-- nothing prevents a user from inserting `provider='AIRTABLE_API_KEY'`
-- today. What's missing is a way for the UI to know whether a row is a
-- canonical provider key (anthropic, openai, …) the app reads at chat-
-- time, or a custom secret the operator defined for their own modules
-- / agent tools / custom integrations to consume.
--
-- This migration adds an explicit `kind` discriminator + an index so the
-- panel can group / filter without scanning rows.
--
-- Idempotent (if-not-exists guards).

alter table aio_control.api_keys
  add column if not exists kind text not null default 'provider';

-- Hard CHECK so the only legal values are the two we use today. Future
-- tiers (e.g. "oauth_token" once we ship OAuth-managed keys) would land
-- as a separate ALTER.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'api_keys_kind_check'
      and conrelid = 'aio_control.api_keys'::regclass
  ) then
    alter table aio_control.api_keys
      add constraint api_keys_kind_check
        check (kind in ('provider', 'custom'));
  end if;
end $$;

create index if not exists idx_api_keys_kind
  on aio_control.api_keys (workspace_id, kind);

comment on column aio_control.api_keys.kind is
  'Discriminator: ''provider'' = canonical (anthropic/openai/…), ''custom'' = user-defined secret read by agent tools / modules / integrations.';

-- The metadata view must expose `kind` so the panel can group/filter
-- without needing a separate query. Postgres CREATE OR REPLACE VIEW
-- forbids changing existing column ORDER, so the new column lands at
-- the end and we keep the old positions intact.
create or replace view aio_control.api_keys_metadata as
select id, workspace_id, scope, scope_id, provider, label,
       (encrypted_value is not null) as has_value,
       created_by, created_at, updated_at,
       kind
from aio_control.api_keys;

grant select on aio_control.api_keys_metadata to authenticated;
