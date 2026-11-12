#!/bin/bash
# Nightly job on the shared instance, run as root by pansori-backup.timer
# (installed by the deploy workflow to /opt/pansori/bin/).
#
# 1. Streams a pg_dump (custom format) of the pansori-postgres container to
#    s3://pansori-backups, where a lifecycle rule deletes dumps after 30 days.
# 2. Publishes BackupSucceeded=1; the pansori-backup-missing alarm
#    (gehsekky-infra, pansori.tf) emails if none arrives for 26 hours.
#
# Restore: see restore-test.sh (a non-destructive rehearsal) and
# docs/DEPLOY.md "Backups and restore".
set -euo pipefail

REGION=${BACKUP_REGION:-us-east-1}
BUCKET=${BACKUP_BUCKET:-pansori-backups}
PG=${BACKUP_PG_CONTAINER:-pansori-postgres}

log() { echo "[backup] $*"; }

KEY="postgres/$(date -u +%Y/%m)/pansori-$(date -u +%Y%m%dT%H%M%SZ).dump"
# The container's own POSTGRES_USER / POSTGRES_DB, so this follows whatever
# /opt/pansori/.env set them to.
docker exec "$PG" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  | aws s3 cp - "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors
SIZE=$(aws s3api head-object --region "$REGION" --bucket "$BUCKET" --key "$KEY" \
  --query ContentLength --output text)
[ "$SIZE" -gt 0 ] || { log "dump is empty: $KEY"; exit 1; }
log "uploaded s3://$BUCKET/$KEY ($SIZE bytes)"

aws cloudwatch put-metric-data --region "$REGION" --namespace pansori \
  --metric-name BackupSucceeded --value 1 --unit Count
log "done"
