-- DB-authored campaign content.
--
-- Lookup model: campaign data starts with the DB record and is supplemented
-- by the campaignData/ folder — `data` holds the DB-authored portion of a
-- Context (any top-level Context fields), merged over the code-defined
-- context at startup (services/campaignContent.ts). A field present here
-- wins; everything absent falls through to code. This is the bridge that
-- lets content move to the database section by section while the
-- campaignData files keep working unchanged.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
