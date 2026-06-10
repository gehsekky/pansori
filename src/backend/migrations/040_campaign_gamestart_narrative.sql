-- Phase 4 of the narrative-hook normalization: promote the campaign-level
-- game-start opening out of the campaigns.data JSONB blob (the `gameStart` key,
-- folded into campaign.intro) into campaign_narratives as a first-class,
-- campaign-scoped POOLED hook — so the opening gets variant pools (random pick
-- per playthrough) + the forward-compat condition/weight columns, exactly like
-- the level / site / object / trap / NPC hooks.
--
-- Owner kind:
--   campaign — owner_id = '<campaignId>' (one opening per campaign), hook 'gameStart'
--
-- The `gameStart` key is LEFT in campaigns.data (inert) — reads take the table
-- (loadOverlay resolves the campaign pool) and the next save strips the key,
-- mirroring the earlier phases' inert legacy source. No table DDL
-- (campaign_narratives is generic over owner_kind; migration 036).
--
-- Idempotent by reconstruction: delete this owner kind, then re-insert from the
-- JSONB string. Identical on re-apply (double-apply safe — the JSONB source is
-- untouched on the scratch DB the check-migrations gate uses).
DELETE FROM campaign_narratives WHERE owner_kind = 'campaign';

INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT id, 'campaign', id, 'gameStart', 0, data->>'gameStart'
FROM campaigns
WHERE jsonb_typeof(data -> 'gameStart') = 'string' AND data->>'gameStart' <> '';
