-- Placed loot moves to the database with its rooms: each campaign room
-- carries placement specs ({ itemId, pos? }) referencing the campaign's
-- composed loot table (ambient SRD catalog + customs) by item id. The
-- overlay materializes them into PlacedLoot entries when DB rooms fold in;
-- a pos makes the item a clickable grid token, no pos = a plain room
-- pickup. Placement keys stay engine-derived (<roomId>#<index>).
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS loot JSONB NOT NULL DEFAULT '[]'::jsonb;
