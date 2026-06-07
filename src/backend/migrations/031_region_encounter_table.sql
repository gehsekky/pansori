-- Region wilderness-encounter table moves to the DB: the creature NAMES
-- (composed bestiary — customs shadow catalog by name) rolled when a
-- marker_move square triggers a random encounter. Stored as a JSONB list;
-- unknown names warn-and-skip at overlay time and fail soft at roll time
-- (the party "senses danger" and presses on), the same convention as room
-- enemy placements. With this, encounterChance + the travel-pace system
-- finally have teeth in DB-born campaigns.
ALTER TABLE campaign_regions ADD COLUMN IF NOT EXISTS encounter_table JSONB NOT NULL DEFAULT '[]'::jsonb;
