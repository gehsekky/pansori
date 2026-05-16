-- Remove mandatory user association from game sessions.
-- Sessions are now identified purely by their UUID.
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_user_id_fkey;
ALTER TABLE game_sessions ALTER COLUMN user_id DROP NOT NULL;
DROP INDEX IF EXISTS idx_sessions_user_status;
