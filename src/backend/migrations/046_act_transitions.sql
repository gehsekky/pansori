-- Branching: acts become a graph. `transitions` is a list of conditioned edges
-- ({when, to}) the engine evaluates every action — the first match advances to
-- the target act (success / failure / variant). `ending` marks a terminal act
-- that resolves the campaign. Both optional, additive JSONB columns alongside
-- the legacy single `advance_trigger`. No backfill; double-apply safe.

ALTER TABLE campaign_acts ADD COLUMN IF NOT EXISTS transitions JSONB;
ALTER TABLE campaign_acts ADD COLUMN IF NOT EXISTS ending      JSONB;
