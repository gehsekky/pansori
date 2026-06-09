-- Normalize narrative hooks into one generic child table: one row per VARIANT
-- of a hook. A hook (e.g. a room's onEnter) is an ordered list of variant rows;
-- the engine picks ONE at random (pickHookText). Multi-paragraph narrative lives
-- as newlines inside a variant's `text`. The table is generic over owner_kind so
-- later phases attach NPC / object / trap / quest hooks with no schema change.
--
-- Phase 1 owner kinds: 'region' | 'town' | 'room' | 'regionSite'. Nested owners
-- path-encode their id as 'parent/child' (campaign ids are slugs — no '/').
--
-- FK is to campaigns(id) ONLY (cascade on campaign delete), NOT to the parent
-- region/room/etc. rows — the table spans heterogeneous parents, so a composite
-- FK like campaign_region_sites uses isn't possible. Orphan cleanup when a
-- parent is removed is handled by the replace-all writers + reverters in
-- campaignContent.ts (scoped DELETE by owner_kind), same delete-then-reinsert
-- discipline putCampaignRegions already follows.
CREATE TABLE IF NOT EXISTS campaign_narratives (
  campaign_id TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_kind  TEXT        NOT NULL,
  owner_id    TEXT        NOT NULL,
  hook        TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  text        TEXT        NOT NULL,
  -- Forward-compat, nullable + inert in phase 1: gate a variant on game state,
  -- and weight the random pick.
  condition   JSONB,
  weight      INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, owner_kind, owner_id, hook, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_campaign_narratives_campaign
  ON campaign_narratives(campaign_id);

-- ── Backfill from the legacy TEXT columns ────────────────────────────────────
-- Idempotent by reconstruction: delete the phase-1 owner kinds, then re-insert
-- from the source columns. Identical on re-apply (double-apply safe). The legacy
-- columns are NOT dropped — migrations 032 (seed) and 035 reference
-- campaign_rooms.on_enter; dropping them re-breaks the check-migrations
-- double-apply gate (the 015/020 incident). They go inert (writers write null).
DELETE FROM campaign_narratives WHERE owner_kind IN ('region', 'town', 'room', 'regionSite');

-- Regions: four single-variant hooks.
INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT r.campaign_id, 'region', r.id, h.hook, 0, h.text
FROM campaign_regions r
CROSS JOIN LATERAL (VALUES
  ('onEnter', r.on_enter),
  ('onFirstEnter', r.on_first_enter),
  ('onExit', r.on_exit),
  ('onFirstExit', r.on_first_exit)
) AS h(hook, text)
WHERE h.text IS NOT NULL AND h.text <> '';

-- Towns: four single-variant hooks.
INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT t.campaign_id, 'town', t.id, h.hook, 0, h.text
FROM campaign_towns t
CROSS JOIN LATERAL (VALUES
  ('onEnter', t.on_enter),
  ('onFirstEnter', t.on_first_enter),
  ('onExit', t.on_exit),
  ('onFirstExit', t.on_first_exit)
) AS h(hook, text)
WHERE h.text IS NOT NULL AND h.text <> '';

-- Region sites: a single on_enter per site; owner_id = 'regionId/siteId'.
INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT s.campaign_id, 'regionSite', s.region_id || '/' || s.id, 'onEnter', 0, s.on_enter
FROM campaign_region_sites s
WHERE s.on_enter IS NOT NULL AND s.on_enter <> '';

-- Rooms: the three single-variant hooks (onEnter handled separately below).
INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT r.campaign_id, 'room', r.id, h.hook, 0, h.text
FROM campaign_rooms r
CROSS JOIN LATERAL (VALUES
  ('onFirstEnter', r.on_first_enter),
  ('onExit', r.on_exit),
  ('onFirstExit', r.on_first_exit)
) AS h(hook, text)
WHERE h.text IS NOT NULL AND h.text <> '';

-- Rooms onEnter is DUAL-FORM: a JSON string-array (a pool — migration 035
-- guarantees valid JSON) → one row per element; a plain string → one row. A
-- leading '[' that parses as a JSON array is the pool form (mirrors
-- parseRoomOnEnter in campaignContent.ts). The validity guard (is_json_array)
-- means a non-JSON '['-leading prose line degrades to a single literal row
-- rather than erroring the cast (SQL has no TRY_CAST).
INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
SELECT src.campaign_id, 'room', src.id, 'onEnter', elem.ord - 1, elem.line
FROM (
  SELECT
    r.campaign_id,
    r.id,
    CASE
      WHEN left(btrim(r.on_enter), 1) = '['
           AND (r.on_enter IS JSON ARRAY)
        THEN r.on_enter::jsonb
      ELSE to_jsonb(ARRAY[r.on_enter])
    END AS pool
  FROM campaign_rooms r
  WHERE r.on_enter IS NOT NULL AND r.on_enter <> ''
) src
CROSS JOIN LATERAL jsonb_array_elements_text(src.pool) WITH ORDINALITY AS elem(line, ord);
