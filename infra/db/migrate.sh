#!/usr/bin/env bash
# Run the consolidated schema against the target database.
# Usage: DATABASE_URL=postgres://... ./infra/db/migrate.sh
# Or rely on the env var already being set (e.g. from SSM via the deploy script).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

echo "Running schema migration..."
psql "$DATABASE_URL" -f "$SCRIPT_DIR/schema.sql"
echo "Migration complete."
