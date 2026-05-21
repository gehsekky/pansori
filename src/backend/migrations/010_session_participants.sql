-- Multiplayer foundation: who is participating in which session.
--
-- Before: game_sessions.user_id was single-tenant. Authorization was
-- "user owns the session." Worked fine for solo play; can't model 2-4
-- player co-op where multiple humans share one session.
--
-- After: a join table maps users to sessions. The session's original
-- user_id stays as the HOST (matters for delete + invite-token rotation +
-- "pause when host disconnects" UX). Anyone else who joins via the
-- invite link is a participant; the host can reassign which PCs they
-- control via session_participants — that mapping lives in the JSONB
-- state on each Character (Character.owner_user_id), not here. Keeping
-- per-PC ownership in JSONB matches how the rest of character state is
-- modeled and avoids a row-per-character expansion of this table.
--
-- This migration is a no-op for behavior — PR 2 wires the auth guards
-- that actually use these rows. PR 3 wires the realtime broadcasts.
-- Solo sessions remain solo until PR 4's invite UX lets someone join.

-- 1. The join table itself. role defaults to 'pc' so a future 'dm'
--    role can be added without a schema migration (covered in
--    docs/TODO.md "Multiplayer MVP — design calls (locked)").
CREATE TABLE IF NOT EXISTS session_participants (
  session_id  UUID         NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT         NOT NULL DEFAULT 'pc',
  joined_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

-- 2. Fast lookup: "what sessions is user X in?" (drives the session
--    list query in routes/game.ts /sessions endpoint after PR 2).
CREATE INDEX IF NOT EXISTS idx_session_participants_user
  ON session_participants(user_id);

-- 3. Backfill: every existing session's host is also a participant.
--    Once PR 2 changes the authorization to "user is a participant"
--    instead of "user is the host," this row is what keeps the host
--    able to read their own sessions. Idempotent via ON CONFLICT.
INSERT INTO session_participants (session_id, user_id, role)
SELECT id, user_id, 'pc'
FROM game_sessions
WHERE user_id IS NOT NULL
ON CONFLICT (session_id, user_id) DO NOTHING;

-- 4. Per-session invite token. Generated at session creation in PR 4;
--    rotatable by the host if the link leaks. NULL on existing sessions
--    until the host opens the participants modal and generates one
--    (deferred: lazy generation on first invite). Nullable so the
--    migration doesn't have to fabricate tokens for existing rows.
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS invite_token TEXT;

CREATE INDEX IF NOT EXISTS idx_game_sessions_invite_token
  ON game_sessions(invite_token)
  WHERE invite_token IS NOT NULL;
