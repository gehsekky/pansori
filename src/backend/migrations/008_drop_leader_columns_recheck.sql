-- Re-run the leader-column drop to converge drifted production schemas.
--
-- The migration runner shipped in commit dc0125c had a "smart first-run"
-- heuristic: if schema_migrations was empty but game_sessions already
-- existed, mark *all* current migration files as already-applied without
-- running them. The intent was to avoid re-running 001-006 against DBs
-- that were initialised via Docker's docker-entrypoint-initdb.d (which
-- doesn't track history). But that also incorrectly marked 007 as applied
-- on production — even though 007 was added *after* the original init and
-- never ran there. Symptom: "null value in column character_name violates
-- not-null constraint" on /game/new because the backend stopped supplying
-- the leader columns but the DB still had them with NOT NULL.
--
-- Idempotent: DROP COLUMN IF EXISTS is a no-op on databases where 007
-- already actually applied.

ALTER TABLE game_sessions
  DROP COLUMN IF EXISTS character_name,
  DROP COLUMN IF EXISTS character_class,
  DROP COLUMN IF EXISTS portrait_url;
