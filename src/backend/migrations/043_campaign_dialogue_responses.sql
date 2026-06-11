-- NPC dialogue replies become a first-class relational object — the last script
-- content still inline in a JSONB column (campaign_rooms.npcs[].responses). The
-- tree is recursive, so this is an adjacency list: each node has a stable id +
-- parent_id + sort_order, reconstructed into the nested shape on read.
--
-- Mechanics (condition, the skill check, consequences) are irreducible json-
-- rules-engine / consequence structures → JSONB columns (the quests/rooms
-- precedent). label + reply are plain prose columns.
--
-- STABLE NODE ID — the key to the id-keyed dispatcher: backfilled ids are the
-- node's original dotted INDEX PATH ('0', '0.1', '0.1.2'). The runtime's old
-- once-tracking keyed `dialogue_chosen` as `npcId:<dotted path>`; the new id-
-- keyed once-key is `npcId:<node id>` — identical for backfilled content, so
-- existing saves' once-state resolves unchanged with no data migration.
--
--   campaign_dialogue_responses — PK (campaign_id, room_id, npc_id, id);
--   parent_id NULL = a root option for that NPC; sort_order orders siblings.

CREATE TABLE IF NOT EXISTS campaign_dialogue_responses (
  campaign_id  TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  room_id      TEXT        NOT NULL,
  npc_id       TEXT        NOT NULL,
  id           TEXT        NOT NULL,
  parent_id    TEXT,
  sort_order   INT         NOT NULL DEFAULT 0,
  label        TEXT        NOT NULL,
  reply        TEXT,
  once         BOOLEAN     NOT NULL DEFAULT FALSE,
  condition    JSONB,
  skill_check  JSONB,
  consequences JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, room_id, npc_id, id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_dialogue_responses_npc
  ON campaign_dialogue_responses(campaign_id, room_id, npc_id);

-- Backfill from the campaign_rooms.npcs JSONB. A recursive CTE walks each NPC's
-- response tree to arbitrary depth, minting id = dotted index path and
-- parent_id = the parent's path. Double-apply safe: clear the table, rebuild
-- from the JSONB (left inert — putCampaignRooms strips responses from the npcs
-- JSONB on the next save, and getCampaignRooms reads from this table). The
-- scratch DB the check-migrations gate uses still has the original JSONB, so a
-- re-apply reconstructs identically.
DELETE FROM campaign_dialogue_responses;

WITH RECURSIVE walk AS (
  -- Root options: each NPC's top-level responses.
  SELECT
    cr.campaign_id,
    cr.id AS room_id,
    npc->>'id' AS npc_id,
    (r.ord - 1)::text AS id,
    NULL::text AS parent_id,
    (r.ord - 1)::int AS sort_order,
    r.resp AS node
  FROM campaign_rooms cr
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(cr.npcs) = 'array' THEN cr.npcs ELSE '[]'::jsonb END
  ) AS npc
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(npc->'responses') = 'array' THEN npc->'responses' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS r(resp, ord)
  UNION ALL
  -- Children: descend into each node's `responses`.
  SELECT
    w.campaign_id, w.room_id, w.npc_id,
    w.id || '.' || (c.ord - 1)::text AS id,
    w.id AS parent_id,
    (c.ord - 1)::int AS sort_order,
    c.child AS node
  FROM walk w
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.node->'responses') = 'array' THEN w.node->'responses' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS c(child, ord)
)
INSERT INTO campaign_dialogue_responses
  (campaign_id, room_id, npc_id, id, parent_id, sort_order, label, reply, once, condition, skill_check, consequences)
SELECT
  campaign_id, room_id, npc_id, id, parent_id, sort_order,
  node->>'label',
  node->>'reply',
  COALESCE((node->>'once')::boolean, FALSE),
  node->'condition',
  node->'check',
  COALESCE(node->'consequences', '[]'::jsonb)
FROM walk;
