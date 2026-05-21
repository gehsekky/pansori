-- Race detection — turn_seq on game_sessions
--
-- Multiplayer: two participants can both see "your turn" briefly when one
-- player's "end turn" is still in flight. Without a sequence check, both
-- of their clicks would be processed in the order they arrive, and the
-- second one would be a stale-state action.
--
-- Solution: every game_sessions row tracks a monotonically-increasing
-- turn_seq. Every successful takeAction increments it. The client sends
-- its last-known turn_seq with each action; the server rejects (409
-- Conflict) if the requesting client's value is stale.
--
-- Solo invariant preserved: a single client always sees its own most-
-- recent turn_seq (the response carries the new value), so the check
-- only ever bites in multiplayer where multiple clients race.

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS turn_seq integer NOT NULL DEFAULT 0;
