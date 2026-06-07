-- The last two placed-content types move to the database with their rooms:
--
--   objects — searchable/interactable RoomObjects (chests, levers, shrines).
--     Stored as a JSONB list in the engine shape; their lootIds resolve
--     against the campaign's composed loot table at INTERACT time (the
--     engine already skips unknown ids), so no materialization is needed.
--
--   trap — at most ONE per room (the engine's Room.trap shape). Stored as
--     a JSONB object or NULL; the overlay fills sensible defaults for the
--     id/desc/narrative strings the author leaves off.
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS objects JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS trap JSONB;
