-- Placed NPCs move to the database with their rooms. Unlike enemies/loot
-- (catalog references), NPCs are bespoke — each room carries full authored
-- definitions: identity, attitude, greeting + dialogue tree, optional shop
-- (item ids against the composed loot table) and an optional stat block
-- (defaults to an SRD Commoner-style block at overlay time). NPC ids are
-- campaign-unique: the overlay builds the campaign.npcs map from them.
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS npcs JSONB NOT NULL DEFAULT '[]'::jsonb;
