-- 051_slugs.sql — Human-readable slug columns for businesses and nav_nodes.
-- Slugs replace UUID segments in URLs:
--   /business/59831e1d-... → /business/tromptechdesigns
--   /n/abc-uuid/...       → /n/google-ads/...
--
-- Strategy: add nullable column, backfill with slugified name (lower-alpha-
-- numeric + hyphens, max 60 chars), handle same-scope collisions with -2/-3
-- suffix, then add NOT NULL + UNIQUE constraints.

-- ─── businesses.slug ─────────────────────────────────────────────────────────

ALTER TABLE aio_control.businesses ADD COLUMN IF NOT EXISTS slug text;

-- Backfill: slugify name, resolve collisions within the same workspace.
WITH base AS (
  SELECT
    id,
    workspace_id,
    created_at,
    substring(
      lower(
        regexp_replace(
          regexp_replace(name, '[^a-zA-Z0-9\s]', '', 'g'),
          '\s+', '-', 'g'
        )
      )
      FROM 1 FOR 60
    ) AS base_slug
  FROM aio_control.businesses
  WHERE slug IS NULL
),
ranked AS (
  SELECT
    id,
    workspace_id,
    base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, base_slug
      ORDER BY created_at
    ) AS rn
  FROM base
)
UPDATE aio_control.businesses b
SET slug = CASE
  WHEN r.rn = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.rn::text
END
FROM ranked r
WHERE b.id = r.id
  AND b.slug IS NULL;

-- Safety net: if a business name produced an empty slug, fall back to the id.
UPDATE aio_control.businesses
SET slug = id::text
WHERE slug IS NULL OR slug = '';

ALTER TABLE aio_control.businesses ALTER COLUMN slug SET NOT NULL;

DROP INDEX IF EXISTS aio_control.businesses_workspace_slug_unique;
ALTER TABLE aio_control.businesses
  DROP CONSTRAINT IF EXISTS businesses_workspace_slug_unique;
ALTER TABLE aio_control.businesses
  ADD CONSTRAINT businesses_workspace_slug_unique UNIQUE (workspace_id, slug);

-- ─── nav_nodes.slug ──────────────────────────────────────────────────────────

ALTER TABLE aio_control.nav_nodes ADD COLUMN IF NOT EXISTS slug text;

-- Backfill: slugify name, resolve collisions within the same business.
WITH base AS (
  SELECT
    id,
    business_id,
    created_at,
    substring(
      lower(
        regexp_replace(
          regexp_replace(name, '[^a-zA-Z0-9\s]', '', 'g'),
          '\s+', '-', 'g'
        )
      )
      FROM 1 FOR 60
    ) AS base_slug
  FROM aio_control.nav_nodes
  WHERE slug IS NULL
),
ranked AS (
  SELECT
    id,
    business_id,
    base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY business_id, base_slug
      ORDER BY created_at
    ) AS rn
  FROM base
)
UPDATE aio_control.nav_nodes n
SET slug = CASE
  WHEN r.rn = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.rn::text
END
FROM ranked r
WHERE n.id = r.id
  AND n.slug IS NULL;

-- Safety net: fall back to id if name produced an empty slug.
UPDATE aio_control.nav_nodes
SET slug = id::text
WHERE slug IS NULL OR slug = '';

ALTER TABLE aio_control.nav_nodes ALTER COLUMN slug SET NOT NULL;

ALTER TABLE aio_control.nav_nodes
  DROP CONSTRAINT IF EXISTS nav_nodes_business_slug_unique;
ALTER TABLE aio_control.nav_nodes
  ADD CONSTRAINT nav_nodes_business_slug_unique UNIQUE (business_id, slug);
