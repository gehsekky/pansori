-- Quests become a first-class relational object — out of the campaigns.data
-- JSONB blob (the `quests` key, folded wholesale into campaign.quests) into a
-- dedicated table + an ordered child step table, joining regions/towns/rooms.
--
-- Quests are mostly MECHANICS: a step's `condition` is a json-rules-engine tree
-- and a quest's `rewards` is a consequence array — both irreducibly JSONB, so
-- they stay JSONB columns (the rooms precedent). Identity + prose (title, desc,
-- step desc) are plain columns: quest text is persistent display, not an
-- event-fired hook, so it does NOT go through campaign_narratives.
--
--   campaign_quests       — PK (campaign_id, id); sort_order preserves order.
--   campaign_quest_steps  — child, composite FK → campaign_quests (so a step can
--                           never dangle); PK (campaign_id, quest_id, id).
--
-- giver_npc_id / faction_id are plain TEXT (no FK): NPCs live in rooms and
-- factions are still JSONB. Cross-section reference checks are a separate lint.

CREATE TABLE IF NOT EXISTS campaign_quests (
  campaign_id   TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id            TEXT        NOT NULL,
  sort_order    INT         NOT NULL DEFAULT 0,
  title         TEXT        NOT NULL,
  description   TEXT        NOT NULL,
  giver_npc_id  TEXT,
  faction_id    TEXT,
  rep_gain      INT,
  start_active  BOOLEAN     NOT NULL DEFAULT FALSE,
  rewards       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_quests_campaign
  ON campaign_quests(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_quest_steps (
  campaign_id  TEXT        NOT NULL,
  quest_id     TEXT        NOT NULL,
  id           TEXT        NOT NULL,
  sort_order   INT         NOT NULL DEFAULT 0,
  description  TEXT        NOT NULL,
  condition    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, quest_id, id),
  FOREIGN KEY (campaign_id, quest_id)
    REFERENCES campaign_quests(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_quest_steps_quest
  ON campaign_quest_steps(campaign_id, quest_id);

-- Backfill from the interim JSONB `quests` array. Idempotent by reconstruction:
-- clear the tables (steps cascade), re-insert from the JSONB. The JSONB key is
-- LEFT inert (writers strip it on the next save) so a re-apply on the scratch DB
-- the check-migrations gate uses reconstructs identically (double-apply safe).
DELETE FROM campaign_quests;

INSERT INTO campaign_quests
  (campaign_id, id, sort_order, title, description, giver_npc_id, faction_id, rep_gain, start_active, rewards)
SELECT c.id, q->>'id', (qe.ord - 1)::int, q->>'title', q->>'desc',
       q->>'giverNpcId', q->>'factionId',
       CASE WHEN q ? 'repGain' THEN (q->>'repGain')::int ELSE NULL END,
       COALESCE((q->>'startActive')::boolean, FALSE),
       COALESCE(q->'rewards', '[]'::jsonb)
FROM campaigns c
CROSS JOIN LATERAL jsonb_array_elements(c.data->'quests') WITH ORDINALITY AS qe(q, ord)
WHERE jsonb_typeof(c.data->'quests') = 'array';

INSERT INTO campaign_quest_steps
  (campaign_id, quest_id, id, sort_order, description, condition)
SELECT c.id, q->>'id', s->>'id', (se.ord - 1)::int, s->>'desc',
       COALESCE(s->'condition', '{}'::jsonb)
FROM campaigns c
CROSS JOIN LATERAL jsonb_array_elements(c.data->'quests') AS q
CROSS JOIN LATERAL jsonb_array_elements(q->'steps') WITH ORDINALITY AS se(s, ord)
WHERE jsonb_typeof(c.data->'quests') = 'array' AND jsonb_typeof(q->'steps') = 'array';
