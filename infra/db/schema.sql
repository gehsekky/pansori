-- Pansori — consolidated idempotent schema
-- Run this on a fresh RDS instance or re-run safely against an existing one.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50)  UNIQUE,
  password_hash TEXT,
  google_id     TEXT UNIQUE,
  email         TEXT UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Game sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  character_name  VARCHAR(100) NOT NULL,
  character_class VARCHAR(50)  NOT NULL,
  portrait_url    TEXT,
  seed            JSONB        NOT NULL,
  state           JSONB        NOT NULL DEFAULT '{}',
  status          VARCHAR(20)  NOT NULL DEFAULT 'active',
  -- status values: active | dead | escaped | abandoned
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON game_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_updated     ON game_sessions(updated_at DESC);

-- ─── Express session store (connect-pg-simple) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "session" (
  sid    VARCHAR     NOT NULL COLLATE "default",
  sess   JSON        NOT NULL,
  expire TIMESTAMPTZ NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" (expire);
