#!/usr/bin/env bash
# Fresh-environment migration check: apply every migration file to a
# scratch database TWICE, in order, against the running dev postgres.
#
# Why twice: fresh environments (CI, new dev volumes) run the migrations
# directory once via docker-entrypoint-initdb.d and then AGAIN via the
# backend's migrationRunner (schema_migrations starts empty), so every
# file must survive re-application against the final schema. A later
# migration dropping a column an earlier migration references breaks
# exactly this path (see 015/020, 2026-06-06) while leaving incrementally
# evolved dev databases — and therefore unit + e2e suites — green.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=migration_check
psql() { docker compose exec -T postgres psql -U pansori "$@"; }

psql -d pansori_db -q -c "DROP DATABASE IF EXISTS ${DB};"
psql -d pansori_db -q -c "CREATE DATABASE ${DB};"
trap 'psql -d pansori_db -q -c "DROP DATABASE IF EXISTS '"${DB}"';"' EXIT

for pass in 1 2; do
  for f in src/backend/migrations/*.sql; do
    if ! psql -d "${DB}" -v ON_ERROR_STOP=1 -q < "$f" > /dev/null 2>/tmp/migration-check-err.log; then
      echo "FAIL (pass ${pass}): $(basename "$f")"
      cat /tmp/migration-check-err.log
      exit 1
    fi
  done
done
echo "migrations ok (double-applied cleanly)"
