#!/bin/bash
# Restores a dump from S3 into a throwaway Postgres container and compares
# every table's row count with the live database. Touches nothing live.
#
#   bash /opt/pansori/bin/restore-test.sh          # newest dump
#   bash /opt/pansori/bin/restore-test.sh <key>    # a specific one
#
# Row counts can differ slightly if someone played after the dump ran.
set -euo pipefail

REGION=${BACKUP_REGION:-us-east-1}
BUCKET=${BACKUP_BUCKET:-pansori-backups}
LIVE=${BACKUP_PG_CONTAINER:-pansori-postgres}
SCRATCH=pansori-restore-test
IMAGE=$(docker inspect --format '{{.Config.Image}}' "$LIVE")
DB=$(docker exec "$LIVE" printenv POSTGRES_DB)
USR=$(docker exec "$LIVE" printenv POSTGRES_USER)

log() { echo "[restore-test] $*"; }

KEY=${1:-$(aws s3api list-objects-v2 --region "$REGION" --bucket "$BUCKET" \
  --prefix postgres/ --query 'sort_by(Contents, &LastModified)[-1].Key' --output text)}
[ -n "$KEY" ] && [ "$KEY" != None ] || { log "no dumps in s3://$BUCKET"; exit 1; }

TMP=$(mktemp -d)
cleanup() { docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

aws s3 cp --region "$REGION" --only-show-errors "s3://$BUCKET/$KEY" "$TMP/dump"
log "downloaded $KEY ($(stat -c %s "$TMP/dump") bytes)"

# No network and a small memory limit: it only has to hold a restore.
docker run -d --name "$SCRATCH" --network none --memory 256m \
  -e POSTGRES_USER="$USR" -e POSTGRES_DB="$DB" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$IMAGE" postgres -c shared_buffers=32MB >/dev/null
for _ in $(seq 1 60); do
  # The entrypoint restarts Postgres once after initdb, so check twice.
  docker exec "$SCRATCH" pg_isready -q -U "$USR" 2>/dev/null && sleep 2 \
    && docker exec "$SCRATCH" pg_isready -q -U "$USR" 2>/dev/null && break
  sleep 1
done

docker exec -i "$SCRATCH" pg_restore -U "$USR" -d "$DB" \
  --exit-on-error --no-owner < "$TMP/dump"
log "restored into a throwaway container"

COUNTS="SELECT table_schema || '.' || table_name, (xpath('/row/c/text()',
  query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
  false, true, '')))[1]::text FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"
docker exec "$SCRATCH" psql -U "$USR" -d "$DB" -qAt -c "$COUNTS" | LC_ALL=C sort > "$TMP/restored"
docker exec "$LIVE" psql -U "$USR" -d "$DB" -qAt -c "$COUNTS" | LC_ALL=C sort > "$TMP/live"

echo "table|restored|live"
LC_ALL=C join -t '|' -a1 -a2 -e missing -o 0,1.2,2.2 "$TMP/restored" "$TMP/live"
if cmp -s "$TMP/restored" "$TMP/live"; then
  log "row counts match"
else
  log "row counts differ (see above)"
  exit 1
fi
