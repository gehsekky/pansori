-- Catalogs become ambient: every campaign automatically gets the full SRD
-- item + monster catalogs, so the per-campaign selection mappings (016/017)
-- are unnecessary — the engine only ever LOOKS UP entries by id/name (loot
-- resolution, drops, quest rewards, encounter tables); it never samples the
-- pool, so an unreferenced catalog entry simply never surfaces in play.
--
-- What campaigns DO need to store is their own content: custom items and
-- custom monsters (including tweaks — a custom sharing a catalog id/name
-- shadows the catalog entry; resolution order is DB customs → code campaign
-- entries → catalog, earlier wins).
--
-- Existing mapping rows: overrides ARE campaign customs — carry them over.
-- Bare mappings (selection-only) are dropped; the catalog is ambient now.

CREATE TABLE IF NOT EXISTS campaign_custom_items (
  campaign_id TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  item_id     TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  definition  JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, item_id)
);

CREATE TABLE IF NOT EXISTS campaign_custom_monsters (
  campaign_id TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  monster_id  TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  definition  JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, monster_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_custom_items_campaign
  ON campaign_custom_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_custom_monsters_campaign
  ON campaign_custom_monsters(campaign_id);

-- Carry overrides across, then drop the mapping tables. Guarded so a
-- re-run after the drop stays a no-op (idempotency rule).
DO $$
BEGIN
  IF to_regclass('campaign_items') IS NOT NULL THEN
    INSERT INTO campaign_custom_items (campaign_id, item_id, sort_order, definition)
    SELECT campaign_id, item_id, sort_order, override
      FROM campaign_items
     WHERE override IS NOT NULL
    ON CONFLICT (campaign_id, item_id) DO NOTHING;
    DROP TABLE campaign_items;
  END IF;
  IF to_regclass('campaign_monsters') IS NOT NULL THEN
    INSERT INTO campaign_custom_monsters (campaign_id, monster_id, sort_order, definition)
    SELECT campaign_id, monster_id, sort_order, override
      FROM campaign_monsters
     WHERE override IS NOT NULL
    ON CONFLICT (campaign_id, monster_id) DO NOTHING;
    DROP TABLE campaign_monsters;
  END IF;
END $$;
