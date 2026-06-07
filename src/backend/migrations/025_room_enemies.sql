-- Placed enemies move to the database with their rooms: each campaign room
-- carries a list of placement specs ({ name, count? }) referencing the
-- campaign's composed bestiary (ambient SRD catalog + customs) by NAME.
-- The overlay materializes them into full Enemy instances (ids
-- <roomId>#<n>) when it folds DB rooms into the campaign block; party-size
-- HP scaling stays a seed-time concern, as for code campaigns.
ALTER TABLE campaign_rooms ADD COLUMN IF NOT EXISTS enemies JSONB NOT NULL DEFAULT '[]'::jsonb;
