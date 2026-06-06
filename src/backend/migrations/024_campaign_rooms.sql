-- Rooms move to the database — the third (local) map level. One row per
-- room with a dense cell grid (JSONB: cosmetic terrain `t` + one
-- mechanical flag `m` per cell — obstacle / difficult / climb / swim /
-- cover) and the exits as a JSONB list (exits carry no identity and are
-- never queried relationally, so no child table). Replace-all section
-- writes, like regions/towns.
--
-- Phase 1 scope: geometry + exits + lighting/floor/canRest. Traps,
-- objects, and placed enemies/loot/NPCs stay code-side for now.

CREATE TABLE IF NOT EXISTS campaign_rooms (
  campaign_id     TEXT             NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id              TEXT             NOT NULL,
  sort_order      INT              NOT NULL DEFAULT 0,
  name            TEXT             NOT NULL,
  description     TEXT             NOT NULL DEFAULT '',
  feet_per_square DOUBLE PRECISION NOT NULL DEFAULT 5,
  grid            JSONB            NOT NULL DEFAULT '[]'::jsonb,
  entry_x         INT              NOT NULL,
  entry_y         INT              NOT NULL,
  exits           JSONB            NOT NULL DEFAULT '[]'::jsonb,
  lighting        TEXT,
  floor           TEXT,
  can_rest        BOOLEAN          NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_rooms_campaign
  ON campaign_rooms(campaign_id);
