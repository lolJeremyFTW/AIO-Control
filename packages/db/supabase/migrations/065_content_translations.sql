-- 065_content_translations.sql -- display-only translations for user content.
--
-- Source rows keep their original text. This table stores cached translations
-- keyed by workspace + target locale + source hash so language switches can
-- re-render user-generated dashboard and chat content without mutating the
-- canonical data.

create table if not exists aio_control.content_translations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  locale text not null check (locale in ('nl', 'en', 'de')),
  source_hash text not null check (length(source_hash) = 64),
  source_kind text not null,
  source_id text not null,
  source_field text not null,
  source_text text not null,
  translated_text text not null,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_content_translations_workspace_locale_hash
  on aio_control.content_translations(workspace_id, locale, source_hash);

create index if not exists idx_content_translations_source
  on aio_control.content_translations(workspace_id, source_kind, source_id);

drop trigger if exists trg_touch_content_translations
  on aio_control.content_translations;
create trigger trg_touch_content_translations
  before update on aio_control.content_translations
  for each row execute function aio_control._touch_updated_at();

alter table aio_control.content_translations enable row level security;

drop policy if exists "content_translations_read_member"
  on aio_control.content_translations;
create policy "content_translations_read_member"
  on aio_control.content_translations for select
  using (aio_control.is_workspace_member(workspace_id));
