#!/usr/bin/env bash
# Bring up the isolated, ephemeral e2e stack, run the Playwright suite against
# it, then tear it down — no campaign (or database) is left behind. The suite
# self-seeds its throwaway campaign via POST /api/test/seed-campaign.
#
# Usage: scripts/run-e2e-stack.sh [extra playwright args]
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.e2e.yml"

cleanup() {
  echo "[e2e-stack] tearing down…"
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[e2e-stack] building + starting the ephemeral stack…"
$COMPOSE up --build -d

# Wait for the backend (DB-connected health) and the frontend dev server.
wait_for() {
  local name="$1" url="$2" tries=60
  echo "[e2e-stack] waiting for ${name} (${url})…"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[e2e-stack] ${name} is up."
      return 0
    fi
    sleep 2
  done
  echo "[e2e-stack] ERROR: ${name} did not become ready (${url})." >&2
  $COMPOSE logs --no-color "$name" | tail -50 >&2 || true
  return 1
}

wait_for backend http://localhost:3002/api/health
wait_for frontend http://localhost:5174

echo "[e2e-stack] running Playwright…"
set +e
E2E_BASE_URL=http://localhost:5174 E2E_BACKEND_URL=http://localhost:3002 \
  npx playwright test "$@"
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo "[e2e-stack] PASS"
else
  echo "[e2e-stack] FAIL (exit ${status})" >&2
fi
exit "$status"
