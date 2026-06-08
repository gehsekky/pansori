-- Painted intra-region encounter zones. A region's wilderness map can now hold
-- any number of non-overlapping sub-areas, each with its own creature pool.
-- This column stores the zone METADATA only —
--   [{ "id": <slug>, "name": <text>, "encounterChance"?: 0..1, "encounterTable"?: [<name>] }]
-- the per-square geometry lives on each grid cell via an `ez` tag (a single zone
-- id per cell ⇒ zones can't overlap), inside the existing `grid` JSONB. A square
-- not in any zone falls back to the region-level encounter_table/encounter_chance.
ALTER TABLE campaign_regions ADD COLUMN IF NOT EXISTS encounter_zones JSONB NOT NULL DEFAULT '[]'::jsonb;
