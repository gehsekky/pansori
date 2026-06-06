-- Towns move to the database — the second map level, mirroring regions
-- (015/019/020): a parent row with a dense terrain grid (JSONB) plus a
-- child table of venues (the town grid's transition cells: 'interior'
-- opens a local room via entry_room_id; 'gate' ascends back to the
-- region). Replace-all section writes cascade venue rows with their town.
--
-- entry_room_id stays un-FK'd until rooms migrate to tables.

CREATE TABLE IF NOT EXISTS campaign_towns (
  campaign_id     TEXT             NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id              TEXT             NOT NULL,
  sort_order      INT              NOT NULL DEFAULT 0,
  name            TEXT             NOT NULL,
  description     TEXT,
  feet_per_square DOUBLE PRECISION NOT NULL,
  grid            JSONB            NOT NULL DEFAULT '[]'::jsonb,
  start_x         INT              NOT NULL,
  start_y         INT              NOT NULL,
  floor           TEXT,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, id)
);

CREATE TABLE IF NOT EXISTS campaign_town_venues (
  campaign_id   TEXT        NOT NULL,
  town_id       TEXT        NOT NULL,
  id            TEXT        NOT NULL,
  sort_order    INT         NOT NULL DEFAULT 0,
  name          TEXT        NOT NULL,
  pos_x         INT         NOT NULL,
  pos_y         INT         NOT NULL,
  kind          TEXT        NOT NULL CHECK (kind IN ('interior', 'gate')),
  entry_room_id TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, town_id, id),
  FOREIGN KEY (campaign_id, town_id)
    REFERENCES campaign_towns(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_towns_campaign
  ON campaign_towns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_town_venues_town
  ON campaign_town_venues(campaign_id, town_id);
