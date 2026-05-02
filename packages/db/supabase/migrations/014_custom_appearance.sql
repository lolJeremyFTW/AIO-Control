-- 014_custom_appearance.sql — let users override the preset variant
-- with a custom hex colour AND/OR upload a logo for businesses and
-- nav-nodes. Logos live in a public-read Supabase Storage bucket
-- partitioned by workspace_id so RLS can scope writes to members.

-- ─── Schema columns ──────────────────────────────────────────────────────────
alter table aio_control.businesses
  add column if not exists color_hex text,
  add column if not exists logo_url text;

alter table aio_control.nav_nodes
  add column if not exists color_hex text,
  add column if not exists logo_url text;

-- Enforce hex shape (#rgb or #rrggbb, optionally #rrggbbaa) so we don't
-- end up with garbage flowing into the inline-style attribute.
alter table aio_control.businesses
  drop constraint if exists businesses_color_hex_check;
alter table aio_control.businesses
  add constraint businesses_color_hex_check
  check (
    color_hex is null
    or color_hex ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$'
  );

alter table aio_control.nav_nodes
  drop constraint if exists nav_nodes_color_hex_check;
alter table aio_control.nav_nodes
  add constraint nav_nodes_color_hex_check
  check (
    color_hex is null
    or color_hex ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$'
  );

-- ─── Storage bucket: node-logos ──────────────────────────────────────────────
-- Public read so <img src> works without a signed URL dance.
-- Writes are gated by RLS policies below: only authenticated users
-- who are members of <workspace_id> can upload to that workspace's
-- folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'node-logos',
  'node-logos',
  true,
  524288, -- 512 KiB upper bound — these are icons, not banners
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Drop legacy policies if they exist so re-runs are idempotent.
drop policy if exists "node_logos_select" on storage.objects;
drop policy if exists "node_logos_insert" on storage.objects;
drop policy if exists "node_logos_update" on storage.objects;
drop policy if exists "node_logos_delete" on storage.objects;

-- Anyone can read (bucket is public; this is the explicit policy).
create policy "node_logos_select" on storage.objects
  for select
  using (bucket_id = 'node-logos');

-- Authenticated workspace members can upload under their workspace
-- prefix: <workspace_id>/<anything>.<ext>
create policy "node_logos_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'node-logos'
    and auth.role() = 'authenticated'
    and (string_to_array(name, '/'))[1] in (
      select workspace_id::text
      from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

create policy "node_logos_update" on storage.objects
  for update
  using (
    bucket_id = 'node-logos'
    and auth.role() = 'authenticated'
    and (string_to_array(name, '/'))[1] in (
      select workspace_id::text
      from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

create policy "node_logos_delete" on storage.objects
  for delete
  using (
    bucket_id = 'node-logos'
    and auth.role() = 'authenticated'
    and (string_to_array(name, '/'))[1] in (
      select workspace_id::text
      from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );
