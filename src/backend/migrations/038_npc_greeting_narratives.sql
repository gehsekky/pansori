-- Phase 3 of the narrative-hook normalization: move NPC GREETING / GOODBYE text
-- into campaign_narratives. Each hook becomes a variant pool (the engine picks
-- one at random; multi-paragraph via newlines). NPC DIALOGUE replies stay in the
-- NPC JSONB for now (dialogue nodes have no stable ids — a structured dialogue
-- would need its own table).
--
-- Owner kind: roomNpc — owner_id = '<roomId>/<npcId>' (npc ids are room-unique).
-- Hooks (the field names): greeting (required), firstGreeting, goodbye, firstGoodbye.
--
-- The narrative keys are LEFT in the npcs JSONB (inert) — reads take the rows
-- (they win the reassembly spread) and the next save strips them, mirroring the
-- earlier phases. No table DDL (campaign_narratives exists).
--
-- Idempotent by reconstruction: delete this owner kind, then re-insert from the
-- JSONB. Identical on re-apply (double-apply safe).
DELETE FROM campaign_narratives WHERE owner_kind = 'roomNpc';

INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT cr.campaign_id, 'roomNpc', cr.id || '/' || (npc->>'id'), h.hook, 0, h.text
FROM campaign_rooms cr
CROSS JOIN LATERAL jsonb_array_elements(cr.npcs) AS npc
CROSS JOIN LATERAL (VALUES
  ('greeting', npc->>'greeting'),
  ('firstGreeting', npc->>'firstGreeting'),
  ('goodbye', npc->>'goodbye'),
  ('firstGoodbye', npc->>'firstGoodbye')
) AS h(hook, text)
WHERE npc->>'id' IS NOT NULL AND h.text IS NOT NULL AND h.text <> '';
