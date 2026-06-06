-- Regions move from campaigns.data (interim JSONB section) to a real table.
--
-- First relational content table of the code→DB migration. The content API
-- keeps serving the same JSON list shape (services/campaignContent.ts maps
-- rows ↔ JSON); only the storage changes. Columns mirror the regions
-- section schema (routes/schemas.ts): identity + display, the grid canvas
-- (scale/width/height/start), and the optional tuning scalars.
--
-- `id` is the campaign-scoped slug other content will reference (towns,
-- sites) — PK is (campaign_id, id). `sort_order` preserves the authored
-- list order across the JSON round trip.

CREATE TABLE IF NOT EXISTS campaign_regions (
  campaign_id        TEXT             NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id                 TEXT             NOT NULL,
  sort_order         INT              NOT NULL DEFAULT 0,
  name               TEXT             NOT NULL,
  is_starting_region BOOLEAN          NOT NULL DEFAULT FALSE,
  description        TEXT,
  feet_per_square    DOUBLE PRECISION NOT NULL,
  grid_width         INT              NOT NULL,
  grid_height        INT              NOT NULL,
  start_x            INT              NOT NULL,
  start_y            INT              NOT NULL,
  encounter_chance   DOUBLE PRECISION,
  base_tier          INT,
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_regions_campaign
  ON campaign_regions(campaign_id);

-- Backfill from the interim JSONB section. COALESCE defaults cover blobs
-- saved under the earliest regions schema (id/name/isStartingRegion only,
-- before scale/canvas/startPos became required).
INSERT INTO campaign_regions
  (campaign_id, id, sort_order, name, is_starting_region, description,
   feet_per_square, grid_width, grid_height, start_x, start_y,
   encounter_chance, base_tier)
SELECT c.id,
       r.value->>'id',
       r.ordinality - 1,
       r.value->>'name',
       COALESCE((r.value->>'isStartingRegion')::boolean, FALSE),
       r.value->>'desc',
       COALESCE((r.value->>'feetPerSquare')::double precision, 5280),
       COALESCE((r.value->>'gridWidth')::int, 10),
       COALESCE((r.value->>'gridHeight')::int, 10),
       COALESCE((r.value->'startPos'->>'x')::int, 0),
       COALESCE((r.value->'startPos'->>'y')::int, 0),
       (r.value->>'encounterChance')::double precision,
       (r.value->>'baseTier')::int
FROM campaigns c,
     LATERAL jsonb_array_elements(c.data->'regions') WITH ORDINALITY AS r(value, ordinality)
WHERE jsonb_typeof(c.data->'regions') = 'array'
ON CONFLICT (campaign_id, id) DO NOTHING;

-- The JSONB key is no longer the storage — remove it so the overlay never
-- serves a stale copy.
UPDATE campaigns SET data = data - 'regions' WHERE data ? 'regions';
