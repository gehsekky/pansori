-- A room's arrival flavor consolidates onto the room: the campaign-level
-- `narratives.roomArrival` map (keyed by room id) moves into each room's
-- pooled `on_enter`, and `roomArrival` is stripped from the campaign data.
--
-- `campaign_rooms.on_enter` is a TEXT column that now also holds pools: an
-- array is stored JSON-encoded (a leading '[' marks the JSON form; legacy plain
-- strings read verbatim — see parseRoomOnEnter in campaignContent.ts). The
-- merged pool prepends any existing single-string on_enter so nothing is lost.
--
-- Step 1: for every (room_id -> [lines]) in a campaign's roomArrival, set that
-- room's on_enter to the JSON array [existing on_enter (if any), ...lines].
-- jsonb_each is fed a COALESCE'd '{}' so campaigns without roomArrival are inert
-- (and re-apply is a no-op — step 2 has already stripped roomArrival by then).
UPDATE campaign_rooms cr
SET on_enter = to_jsonb(
  CASE
    WHEN cr.on_enter IS NOT NULL AND cr.on_enter <> '' THEN ARRAY[cr.on_enter]
    ELSE ARRAY[]::text[]
  END
  || ARRAY(SELECT jsonb_array_elements_text(ra.lines))
)::text
FROM campaigns c
CROSS JOIN LATERAL jsonb_each(
  COALESCE(c.data->'narratives'->'roomArrival', '{}'::jsonb)
) AS ra(room_id, lines)
WHERE cr.campaign_id = c.id
  AND cr.id = ra.room_id
  AND jsonb_typeof(ra.lines) = 'array';

-- Step 2: drop roomArrival from every campaign's narratives. Guarded by its
-- presence, so re-apply is a no-op (double-apply safe).
UPDATE campaigns
SET data = jsonb_set(data, '{narratives}', (data->'narratives') - 'roomArrival')
WHERE data->'narratives' ? 'roomArrival';
