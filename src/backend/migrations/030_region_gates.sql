-- Region-to-region travel: a region site may now be a GATE to another
-- region (kind 'region') — a mountain pass, a ferry, the road out. Stepping
-- onto it crosses to `target_region_id`, arriving at that region's startPos
-- unless an explicit entry cell (entry_x/entry_y) is authored. Plain TEXT
-- target (no FK) per the table's convention; the zod payload superRefine
-- cross-validates targets + entry bounds against the regions being saved.
ALTER TABLE campaign_region_sites DROP CONSTRAINT IF EXISTS campaign_region_sites_kind_check;
ALTER TABLE campaign_region_sites
  ADD CONSTRAINT campaign_region_sites_kind_check CHECK (kind IN ('town', 'local', 'region'));
ALTER TABLE campaign_region_sites ADD COLUMN IF NOT EXISTS target_region_id TEXT;
ALTER TABLE campaign_region_sites ADD COLUMN IF NOT EXISTS entry_x INT;
ALTER TABLE campaign_region_sites ADD COLUMN IF NOT EXISTS entry_y INT;
