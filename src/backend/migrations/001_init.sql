CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_name  VARCHAR(100) NOT NULL,
  character_class VARCHAR(50)  NOT NULL,
  seed            JSONB NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'active',
  -- status values: active | dead | escaped | abandoned
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_state (
  session_id  UUID PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  state       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON game_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON game_sessions(created_at DESC);
