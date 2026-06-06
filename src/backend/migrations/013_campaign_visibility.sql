-- Campaign platform model: visibility + the player role.
--
-- End goal: users author their own campaigns and invite friends to play
-- them. A campaign is 'private' by default — only its members see it
-- anywhere (including the new-game picker). Site admins can promote a
-- campaign to 'global', making it visible to every user (the built-in
-- code-authored campaigns are global). Membership therefore gains a third
-- role below editor: 'player' — can see and play the campaign, can't edit.

-- 1. Visibility. Default 'private' matches the end-state (user-created
--    campaigns start private); the backfill below makes today's rows —
--    all code-authored built-ins — global, and the registry sync inserts
--    new code campaigns as global too.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('global', 'private'));

-- At migration time every campaigns row is a code-authored built-in.
UPDATE campaigns SET visibility = 'global';

-- 2. Widen the role check to include 'player'. DROP + ADD keeps the
--    migration idempotent (ADD CONSTRAINT has no IF NOT EXISTS).
ALTER TABLE campaign_members
  DROP CONSTRAINT IF EXISTS campaign_members_role_check;
ALTER TABLE campaign_members
  ADD CONSTRAINT campaign_members_role_check
    CHECK (role IN ('owner', 'editor', 'player'));
