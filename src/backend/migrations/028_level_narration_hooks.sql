-- The full narration-hook matrix for the three map levels. Each of
-- regions / towns / rooms gets onEnter / onFirstEnter / onExit /
-- onFirstExit: the FIRST variant overrides the plain one the first time
-- the party enters/exits that level's SCOPE; the plain one fires every
-- other time. Scope semantics: descending into a town's room does NOT
-- exit the town — only the gate does; entering a town does not exit the
-- region. (Region exit hooks are plumbed but dormant until
-- region-to-region travel exists.) Sites keep their separate per-landing
-- on_enter. New columns append after the existing ones.

ALTER TABLE campaign_regions ADD COLUMN IF NOT EXISTS on_first_enter TEXT;
ALTER TABLE campaign_regions ADD COLUMN IF NOT EXISTS on_exit TEXT;
ALTER TABLE campaign_regions ADD COLUMN IF NOT EXISTS on_first_exit TEXT;

ALTER TABLE campaign_towns ADD COLUMN IF NOT EXISTS on_enter TEXT;
ALTER TABLE campaign_towns ADD COLUMN IF NOT EXISTS on_first_enter TEXT;
ALTER TABLE campaign_towns ADD COLUMN IF NOT EXISTS on_exit TEXT;
ALTER TABLE campaign_towns ADD COLUMN IF NOT EXISTS on_first_exit TEXT;

ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS on_enter TEXT;
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS on_first_enter TEXT;
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS on_exit TEXT;
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS on_first_exit TEXT;
