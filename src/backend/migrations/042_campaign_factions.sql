-- Factions become a first-class relational object — the LAST piece of script
-- content out of the campaigns.data JSONB blob (the `factions` array, folded
-- wholesale into campaign.factions). Quests, rooms, regions, towns and the
-- game-start opening were normalized earlier; this drains the blob.
--
-- thresholds (the per-tier rep floors) and shopPriceModifiers (tier → price
-- multiplier) are irreducible mechanics maps → JSONB columns (the quests/rooms
-- precedent). Identity + prose (name, description) are plain columns. A new
-- `description` column is added here (authored now, wired into play later).
--
--   campaign_factions — PK (campaign_id, id); sort_order preserves order.

CREATE TABLE IF NOT EXISTS campaign_factions (
  campaign_id          TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id                   TEXT        NOT NULL,
  sort_order           INT         NOT NULL DEFAULT 0,
  name                 TEXT        NOT NULL,
  description          TEXT        NOT NULL DEFAULT '',
  thresholds           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  shop_price_modifiers JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_factions_campaign
  ON campaign_factions(campaign_id);

-- Backfill from the JSONB `factions` array. Idempotent by reconstruction: clear
-- the table, re-insert from the JSONB. The JSONB key is LEFT inert (writers
-- strip it on the next save) so a re-apply on the scratch DB the check-migrations
-- gate uses reconstructs identically (double-apply safe).
DELETE FROM campaign_factions;

INSERT INTO campaign_factions
  (campaign_id, id, sort_order, name, description, thresholds, shop_price_modifiers)
SELECT c.id, f->>'id', (fe.ord - 1)::int, f->>'name',
       COALESCE(f->>'description', ''),
       COALESCE(f->'thresholds', '{}'::jsonb),
       COALESCE(f->'shopPriceModifiers', '{}'::jsonb)
FROM campaigns c
CROSS JOIN LATERAL jsonb_array_elements(c.data->'factions') WITH ORDINALITY AS fe(f, ord)
WHERE jsonb_typeof(c.data->'factions') = 'array';
