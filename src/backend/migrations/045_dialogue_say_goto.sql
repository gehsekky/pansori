-- Dialogue follow-ups: `say` (the spoken line, distinct from the clicked menu
-- `label`) and `goto` (hub-and-spoke — jump the conversation cursor to another
-- node by id instead of descending into this node's own children). Both are
-- optional, additive columns on the dialogue table — no backfill, double-apply
-- safe (ADD COLUMN IF NOT EXISTS).

ALTER TABLE campaign_dialogue_responses ADD COLUMN IF NOT EXISTS say  TEXT;
ALTER TABLE campaign_dialogue_responses ADD COLUMN IF NOT EXISTS goto TEXT;
