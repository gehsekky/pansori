-- Drop denormalized "party leader" columns from game_sessions.
--
-- character_name, character_class, and portrait_url predate party support and
-- only described the first character in `state.characters`. Now that every
-- session has 1-4 characters living entirely in the JSONB state column, the
-- denormalized leader fields are stale-by-design (they don't update if the
-- leader dies and the party plays on, don't reflect party size, etc.).
--
-- The route handlers now derive leader info from `state->'characters'->0` at
-- read time, plus a `party_size` from `jsonb_array_length(state->'characters')`.
-- No backfill needed — the JSONB already holds the data.
--
-- Indexes that referenced these columns are dropped first (PG cleans them up
-- automatically on DROP COLUMN, but being explicit makes the rollback cleaner).

ALTER TABLE game_sessions
  DROP COLUMN IF EXISTS character_name,
  DROP COLUMN IF EXISTS character_class,
  DROP COLUMN IF EXISTS portrait_url;
