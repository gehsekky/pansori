-- Monsters move to the database: a global catalog + per-campaign mapping,
-- the same pattern as items (016).
--
-- `monsters` is the shared SRD bestiary (SRD_MONSTERS in code), seeded /
-- refreshed at startup by services/monsterCatalog.ts — code stays canonical
-- for catalog rows. `campaign_monsters` is a campaign's enemyTemplates in
-- authored order.
--
-- EnemyTemplate has no id field (the code catalog is keyed by record key;
-- campaigns spread + retheme entries: {...SRD_MONSTERS.skeleton, name:
-- 'Skeleton Warrior'}), so mapping rows are resolved by DEEP EQUALITY on
-- write: a posted template identical to a catalog definition stores as a
-- bare mapping (tracks code updates); anything else — rethemes and bosses —
-- stores its full definition in `override` under a slug derived from its
-- name. Same customs-as-overrides model as campaign_items.

CREATE TABLE IF NOT EXISTS monsters (
  id         TEXT             PRIMARY KEY,
  name       TEXT             NOT NULL,
  cr         DOUBLE PRECISION NOT NULL,
  definition JSONB            NOT NULL,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_monsters (
  campaign_id TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- No FK to monsters: an id with no catalog row is a campaign-custom
  -- template (its definition lives in `override`).
  monster_id  TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  override    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, monster_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_monsters_campaign
  ON campaign_monsters(campaign_id);
