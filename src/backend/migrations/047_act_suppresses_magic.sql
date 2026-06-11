-- Act-scoped anti-magic. While an act with `suppresses_magic` set is current,
-- the whole act is a region-wide dead-magic field — every spell cast fizzles
-- (the `isSpellSuppressed` chokepoint reads it). The JSONB holds `{ maxLevel? }`
-- (omitted maxLevel = all levels, cantrips included). Optional, additive; no
-- backfill; double-apply safe.

ALTER TABLE campaign_acts ADD COLUMN IF NOT EXISTS suppresses_magic JSONB;
