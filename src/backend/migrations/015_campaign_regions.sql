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

-- (A backfill from the interim `data.regions` JSONB blobs lived here
-- briefly; it referenced grid_width/grid_height, which migration 020
-- later drops — making this file fail the idempotent RE-RUN that fresh
-- environments do (initdb applies the directory, then migrationRunner
-- applies it again). No durable DB ever held those interim blobs, so the
-- backfill is gone rather than column-guarded.)

-- The JSONB key is no longer the storage — remove it so the overlay never
-- serves a stale copy.
UPDATE campaigns SET data = data - 'regions' WHERE data ? 'regions';
