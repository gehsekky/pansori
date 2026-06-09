-- Phase 2 of the narrative-hook normalization: move room OBJECT and TRAP
-- narrative text into campaign_narratives (the generic per-variant table from
-- migration 036). Each hook becomes a variant pool — the engine picks one at
-- random; multi-paragraph lives as newlines within a variant.
--
-- Owner kinds:
--   roomObject — owner_id = '<roomId>/<objId>'  (objects are room-unique)
--   roomTrap   — owner_id = '<roomId>'          (at most one trap per room)
-- Hooks (the field names):
--   object: desc, interactText, foundText, emptyText
--   trap:   desc, triggerNarrative, detectNarrative, disarmSuccess, disarmFail
--
-- The narrative keys are LEFT in the objects/trap JSONB (inert) — reads take the
-- rows (they win the reassembly spread) and the next save strips them, mirroring
-- Phase 1's inert legacy columns. No table DDL (campaign_narratives exists).
--
-- Idempotent by reconstruction: delete these owner kinds, then re-insert from
-- the JSONB. Identical on re-apply (double-apply safe).
DELETE FROM campaign_narratives WHERE owner_kind IN ('roomObject', 'roomTrap');

-- Objects: a row per non-empty narrative field of each object in the JSONB array.
INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT cr.campaign_id, 'roomObject', cr.id || '/' || (obj->>'id'), h.hook, 0, h.text
FROM campaign_rooms cr
CROSS JOIN LATERAL jsonb_array_elements(cr.objects) AS obj
CROSS JOIN LATERAL (VALUES
  ('desc', obj->>'desc'),
  ('interactText', obj->>'interactText'),
  ('foundText', obj->>'foundText'),
  ('emptyText', obj->>'emptyText')
) AS h(hook, text)
WHERE obj->>'id' IS NOT NULL AND h.text IS NOT NULL AND h.text <> '';

-- Trap (singleton per room): a row per non-empty narrative field.
INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT cr.campaign_id, 'roomTrap', cr.id, h.hook, 0, h.text
FROM campaign_rooms cr
CROSS JOIN LATERAL (VALUES
  ('desc', cr.trap->>'desc'),
  ('triggerNarrative', cr.trap->>'triggerNarrative'),
  ('detectNarrative', cr.trap->>'detectNarrative'),
  ('disarmSuccess', cr.trap->>'disarmSuccess'),
  ('disarmFail', cr.trap->>'disarmFail')
) AS h(hook, text)
WHERE cr.trap IS NOT NULL AND h.text IS NOT NULL AND h.text <> '';
