-- Dense terrain grid for DB regions.
--
-- Design call (2026-06-06): instead of migrating the code model's layered
-- resolution (sparse terrain list + tierZones rectangles + region-level
-- defaults), DB regions store ONE dense nested array — `grid` is rows of
-- cell objects, each `{ t: <terrain type>, tier?, enc? }`. One source of
-- truth per square; a future visual painter edits it directly. Terrain
-- BEHAVIOR (passability / travel cost / encounter multiplier) still
-- derives from the shared TERRAIN registry by type; per-cell tier/enc are
-- rare overrides over the region-level defaults.
--
-- Grid dimensions are derived from the array shape (rows × row length,
-- validated rectangular at the API), so the explicit width/height columns
-- go away. Nothing durable is stored in them anywhere yet (the engine
-- still runs on the code map model; prod hasn't received 015+).

ALTER TABLE campaign_regions
  ADD COLUMN IF NOT EXISTS grid JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE campaign_regions
  DROP COLUMN IF EXISTS grid_width,
  DROP COLUMN IF EXISTS grid_height;
