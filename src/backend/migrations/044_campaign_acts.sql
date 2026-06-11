-- Acts: a campaign is a sequence of 1..N acts, like a play. campaign_acts is a
-- first-class table and quests gain an act_id (campaign → acts → quests). Every
-- existing campaign gets a synthesized "Act 1" wrapping its starting region, and
-- all existing quests are stamped into it — so current campaigns play identically.
--
-- Mechanics (the start/end loot effects, the advance trigger) are JSONB columns;
-- name + starting coords are plain columns; the act's onStart/onEnd narrative
-- lives in campaign_narratives (owner_kind 'act'). `advance_trigger` avoids the
-- reserved word `trigger`.

CREATE TABLE IF NOT EXISTS campaign_acts (
  campaign_id        TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id                 TEXT        NOT NULL,
  sort_order         INT         NOT NULL DEFAULT 0,
  name               TEXT        NOT NULL,
  starting_region_id TEXT        NOT NULL,
  start_x            INT         NOT NULL DEFAULT 0,
  start_y            INT         NOT NULL DEFAULT 0,
  start_effect       JSONB,
  end_effect         JSONB,
  advance_trigger    JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_acts_campaign ON campaign_acts(campaign_id);

-- Quests belong to an act, and carry start/complete loot effects (LootEffect
-- JSONB — applied to required members when the quest starts / completes).
ALTER TABLE campaign_quests ADD COLUMN IF NOT EXISTS act_id TEXT;
ALTER TABLE campaign_quests ADD COLUMN IF NOT EXISTS start_effect JSONB;
ALTER TABLE campaign_quests ADD COLUMN IF NOT EXISTS complete_effect JSONB;

-- Synthesize Act 1 per campaign from its (single) starting region. Idempotent by
-- reconstruction: clear + rebuild from campaign_regions (left untouched). On the
-- check-migrations scratch DB campaign_regions is empty, so this inserts nothing
-- and a re-apply is identical. A campaign with no starting region (not yet
-- playable) gets no act — the engine falls back to legacy regions[0] placement.
DELETE FROM campaign_acts;
INSERT INTO campaign_acts (campaign_id, id, sort_order, name, starting_region_id, start_x, start_y)
SELECT campaign_id, 'act-1', 0, 'Act 1', id, start_x, start_y
FROM campaign_regions
WHERE is_starting_region = TRUE;

-- Stamp existing quests into Act 1. Idempotent: fills only NULLs, so a re-apply
-- (or a later save that re-points a quest) is preserved.
UPDATE campaign_quests SET act_id = 'act-1' WHERE act_id IS NULL;
