-- Retrofit users table for Google SSO; add express-session store; re-apply user FK.

-- 1. Extend users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

-- username / password_hash are no longer required — make nullable so old rows survive
ALTER TABLE users ALTER COLUMN username      DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Session store for connect-pg-simple (table name must be "session")
CREATE TABLE IF NOT EXISTS "session" (
  sid    VARCHAR      NOT NULL COLLATE "default",
  sess   JSON         NOT NULL,
  expire TIMESTAMPTZ  NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" (expire);

-- 3. Re-apply user ownership on game_sessions (nullable — anonymous sessions allowed during dev)
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON game_sessions(user_id, status);
