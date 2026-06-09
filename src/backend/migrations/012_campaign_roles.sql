-- Campaign roles foundation: site admins + per-campaign owners/editors.
--
-- Groundwork for the campaign-editing admin section. Campaigns are still
-- authored in code (campaignData/*); this migration gives them a DB anchor
-- so authorization (and, later, DB-authored content tables) has something
-- to reference. The campaigns table is populated by a startup sync
-- (services/campaignRegistry.ts) that upserts a row per discovered context,
-- mirroring how migrationRunner itself works — code remains the source of
-- truth for campaign *content* for now; the DB row is the authz anchor.

-- 1. Site-admin flag. Admins can manage any campaign's members and will
--    gate the future admin section. Bootstrapped manually:
--      UPDATE users SET is_admin = TRUE WHERE email = '<you>';
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Campaign registry. `id` is the context id (a short slug) — campaigns are
--    keyed by that string everywhere in the engine, so the registry uses it
--    directly rather than minting a synthetic UUID.
CREATE TABLE IF NOT EXISTS campaigns (
  id         TEXT         PRIMARY KEY,
  name       TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. Membership: who may manage/edit each campaign. Same shape as
--    session_participants. Roles are a two-tier hierarchy:
--      owner  — manage members + everything an editor can do
--      editor — edit campaign content (once the admin section lands)
--    Site admins bypass membership checks entirely (no row needed).
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT         NOT NULL CHECK (role IN ('owner', 'editor')),
  added_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);

-- Fast lookup: "what campaigns can user X edit?" (drives GET /api/campaigns).
CREATE INDEX IF NOT EXISTS idx_campaign_members_user
  ON campaign_members(user_id);
