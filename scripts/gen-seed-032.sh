#!/usr/bin/env bash
# Regenerate the body of migration 032 (seed sandbox + malgovia as DB
# campaigns) from the dev database. Run AFTER serializeCampaign.ts has written
# the campaigns into the dev DB:
#
#   docker compose exec backend npx tsx scripts/serializeCampaign.ts sandbox malgovia
#   bash scripts/gen-seed-032.sh > /tmp/seed_body.sql
#   # then prepend the header comment and write src/backend/migrations/032_seed_base_campaigns.sql
#   npm run check-migrations
#
# It emits column-INSERTs via Postgres `format('%L', ...)` (which safely quotes
# every value, JSONB included), reading the live rows for the two ids. The
# campaigns row UPSERTs (only `data` refreshes on re-apply); all relational +
# custom content is DELETE-then-INSERT scoped to the two ids (replace-all =
# double-apply safe), children emitted before parents per the FK order.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL() { docker compose exec -T postgres psql -U pansori -d pansori_db -tA "$@"; }
IDS="'sandbox','malgovia'"

# Insert columns = every column except the now()-defaulted timestamps.
cols_of() {
  PSQL -c "SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
           FROM information_schema.columns
           WHERE table_name='$1' AND column_name NOT IN ('created_at','updated_at');"
}

# Generic child-table INSERT generator (campaign_id is on every child table).
gen_child() {
  local table=$1 order=$2 cols ph args
  cols=$(cols_of "$table")
  ph=$(echo "$cols" | sed 's/[^,]*/%L/g')   # one %L per column
  args=$(echo "$cols" | sed 's/,/, /g')      # the column names as format() args
  PSQL -c "SELECT format('INSERT INTO $table ($cols) VALUES ($ph);', $args)
           FROM $table WHERE campaign_id IN ($IDS) ORDER BY $order;"
}

echo "-- campaigns (upsert: keep name/visibility/name_overridden on re-apply; only data refreshes)"
PSQL -c "SELECT format(E'INSERT INTO campaigns (id, name, visibility, data, name_overridden) VALUES (%L, %L, %L, %L, %L)\nON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;',
                  id, name, CASE WHEN id='sandbox' THEN 'private' ELSE visibility END, data, name_overridden)
         FROM campaigns WHERE id IN ($IDS) ORDER BY id;"

echo ""
echo "-- wipe + reseed all relational/custom content for the two campaigns (replace-all = double-apply safe; children before parents)"
echo "DELETE FROM campaign_region_sites    WHERE campaign_id IN ($IDS);"
echo "DELETE FROM campaign_town_venues     WHERE campaign_id IN ($IDS);"
echo "DELETE FROM campaign_regions         WHERE campaign_id IN ($IDS);"
echo "DELETE FROM campaign_towns           WHERE campaign_id IN ($IDS);"
echo "DELETE FROM campaign_rooms           WHERE campaign_id IN ($IDS);"
echo "DELETE FROM campaign_custom_items    WHERE campaign_id IN ($IDS);"
echo "DELETE FROM campaign_custom_monsters WHERE campaign_id IN ($IDS);"

echo ""; echo "-- campaign_regions";         gen_child campaign_regions         "campaign_id, sort_order, id"
echo ""; echo "-- campaign_region_sites";    gen_child campaign_region_sites    "campaign_id, region_id, sort_order, id"
echo ""; echo "-- campaign_towns";           gen_child campaign_towns           "campaign_id, sort_order, id"
echo ""; echo "-- campaign_town_venues";     gen_child campaign_town_venues     "campaign_id, town_id, sort_order, id"
echo ""; echo "-- campaign_rooms";           gen_child campaign_rooms           "campaign_id, sort_order, id"
echo ""; echo "-- campaign_custom_items";    gen_child campaign_custom_items    "campaign_id, sort_order, item_id"
echo ""; echo "-- campaign_custom_monsters"; gen_child campaign_custom_monsters "campaign_id, sort_order, monster_id"
