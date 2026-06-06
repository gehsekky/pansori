-- Items move to the database: a global catalog + per-campaign mapping.
--
-- `items` is the shared catalog — the SRD equipment registry (SRD_ITEMS in
-- code) seeded/refreshed at startup by services/itemCatalog.ts. Code stays
-- canonical for catalog rows: the sync upserts name/type/definition on
-- every boot, so catalog items are not DB-editable (edit the code).
--
-- `campaign_items` is which items a campaign offers (the DB version of the
-- code's `srdItems('dagger', ...)` selection), in authored order. The
-- `override` column carries a full LootItem definition and serves two
-- purposes:
--   - a campaign-specific tweak of a catalog item (same id, different def —
--     today's "place your own entry after the spread" pattern), and
--   - a fully custom campaign item (an id with no catalog row at all).
-- Customs-as-overrides keeps item ids campaign-scoped by construction — no
-- cross-campaign id collisions, no owner column on the catalog.
--
-- The definition payload is JSONB (LootItem is ~30 optional-heavy nested
-- fields), validated against the lootTable section schema on write.

CREATE TABLE IF NOT EXISTS items (
  id         TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL,
  definition JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_items (
  campaign_id TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- No FK to items: an id with no catalog row is a campaign-custom item
  -- (its definition lives in `override`).
  item_id     TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  override    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign
  ON campaign_items(campaign_id);
