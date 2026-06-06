-- Narration hooks (phase 1): authored flavor text fired at well-defined
-- moments. Regions get on_enter (fires on FIRST entry — game start counts;
-- falls back to description when absent); sites get on_enter (fires every
-- landing, appended to the "You enter X." line). The game-start hook lives
-- in campaigns.data under the 'gameStart' key (overlays campaign.intro) —
-- no column needed.

ALTER TABLE campaign_regions ADD COLUMN IF NOT EXISTS on_enter TEXT;
ALTER TABLE campaign_region_sites ADD COLUMN IF NOT EXISTS on_enter TEXT;
