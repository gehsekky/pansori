-- Encounters move ENTIRELY into encounter zones (each a self-contained
-- tier + chance + creature table painted onto squares). The region-level
-- encounter_chance / encounter_table no longer drive anything.
--
-- Convert any region that still carries a region-level encounter table into ONE
-- Tier-1 zone "wilds" covering every square: build the zone from the region's
-- existing chance + table, tag every grid cell with ez='wilds' (and strip the
-- now-dead per-cell `tier`/`enc` keys while we're rewriting the grid), then clear
-- the region-level encounter fields. (The columns stay — dropping them would
-- break migration 032's double-apply — but go inert.)
--
-- Guarded by `encounter_zones = '[]'` so it's a no-op on re-apply (double-apply
-- safe) and skips regions already using zones.
UPDATE campaign_regions AS r
SET
  grid = (
    SELECT jsonb_agg(sub.new_row ORDER BY rw.ord)
    FROM jsonb_array_elements(r.grid) WITH ORDINALITY AS rw(arr, ord),
    LATERAL (
      SELECT jsonb_agg((cl.elem - 'tier' - 'enc') || '{"ez":"wilds"}'::jsonb ORDER BY cl.ord)
               AS new_row
      FROM jsonb_array_elements(rw.arr) WITH ORDINALITY AS cl(elem, ord)
    ) sub
  ),
  encounter_zones = jsonb_build_array(
    jsonb_build_object(
      'id', 'wilds',
      'name', 'Wilds',
      'tier', 1,
      'encounterChance', COALESCE(r.encounter_chance, 0.1),
      'encounterTable', r.encounter_table
    )
  ),
  encounter_table = '[]'::jsonb,
  encounter_chance = NULL
WHERE r.encounter_zones = '[]'::jsonb
  AND jsonb_array_length(r.encounter_table) > 0;
