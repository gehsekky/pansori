DROP TABLE IF EXISTS game_state;

ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{}';
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sessions_created ON game_sessions(created_at DESC);
