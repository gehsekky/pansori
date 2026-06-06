-- Region sites — the first child object of campaign_regions (015).
--
-- A site is a transition cell on the regional grid (MapSite in types.ts):
-- stepping onto it opens a town grid (kind 'town' → town_id) or drops the
-- party into a local room (kind 'local' → entry_room_id). Sites are
-- authored INSIDE each region's JSON in the regions content section; the
-- composite FK cascade matches that section's replace-all write semantics —
-- rewriting a campaign's regions rewrites their sites with them.
--
-- town_id / entry_room_id are plain TEXT (no FK): towns and rooms haven't
-- migrated to tables yet. Cross-validation tightens when they do.

CREATE TABLE IF NOT EXISTS campaign_region_sites (
  campaign_id   TEXT        NOT NULL,
  region_id     TEXT        NOT NULL,
  id            TEXT        NOT NULL,
  sort_order    INT         NOT NULL DEFAULT 0,
  name          TEXT        NOT NULL,
  pos_x         INT         NOT NULL,
  pos_y         INT         NOT NULL,
  kind          TEXT        NOT NULL CHECK (kind IN ('town', 'local')),
  town_id       TEXT,
  entry_room_id TEXT,
  description   TEXT,
  icon          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, region_id, id),
  FOREIGN KEY (campaign_id, region_id)
    REFERENCES campaign_regions(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_region_sites_region
  ON campaign_region_sites(campaign_id, region_id);
