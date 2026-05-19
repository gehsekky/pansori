-- Multi-provider auth — decouple users from a single OAuth provider.
--
-- Before: users.google_id was the only OAuth subject column. A user could
-- only ever link one Google account; adding GitHub/Discord/Apple required
-- adding more columns and rewriting the upsert each time.
--
-- After: user_identities is a join table (one user → many identities). Each
-- row pairs a (provider, provider_id) to a user. The application picks the
-- user row when the (provider, provider_id) tuple already exists, otherwise
-- creates a new user and a new identity row.
--
-- users.google_id is backfilled into user_identities and then dropped — no
-- code reads it after this migration.

-- 1. The join table itself.
CREATE TABLE IF NOT EXISTS user_identities (
  user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT    NOT NULL,
  provider_id TEXT    NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, provider_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

-- 2. Backfill from users.google_id. Idempotent — ON CONFLICT DO NOTHING
--    means re-running this migration after partial completion is safe.
INSERT INTO user_identities (user_id, provider, provider_id)
SELECT id, 'google', google_id
FROM users
WHERE google_id IS NOT NULL
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 3. Drop the now-deprecated single-provider column. Guarded with IF EXISTS
--    so re-running the migration on an already-migrated DB doesn't fail.
ALTER TABLE users DROP COLUMN IF EXISTS google_id;
