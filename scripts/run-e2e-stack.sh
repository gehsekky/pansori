#!/usr/bin/env bash
# Bring up the isolated, ephemeral e2e stack, run the Playwright suite against
# it, then tear it down — no campaign (or database) is left behind. The suite
# self-seeds its throwaway campaign via POST /api/test/seed-campaign.
#
# Usage: scripts/run-e2e-stack.sh [extra playwright args]
#
# Environment:
#   E2E_PG_PORT / E2E_BACKEND_PORT / E2E_FRONTEND_PORT
#       Host ports for the stack (defaults 5433 / 3002 / 5174). When one is
#       left unset and its default is already taken (e.g. another project's
#       Postgres on 5433), the next free port is used instead. A port set
#       explicitly is used as-is.
#   E2E_PLAYWRIGHT=auto|local|docker   (default auto)
#       local:  run `npx playwright test` on this machine.
#       docker: run it in the official Playwright image matching the installed
#               @playwright/test version, on the host network. For machines
#               where Playwright can't install its browser (e.g. Ubuntu 26.04
#               with Playwright 1.60).
#       auto:   local when Playwright's Chromium is installed, else docker.
set -euo pipefail
cd "$(dirname "$0")/.."

port_in_use() {
  (echo >"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

# pick_port VAR DEFAULT — export VAR, moving off DEFAULT if it's busy.
pick_port() {
  local var="$1" port="$2"
  if [ -n "${!var:-}" ]; then
    export "$var"
    return
  fi
  while port_in_use "$port"; do
    port=$((port + 1))
  done
  if [ "$port" != "$2" ]; then
    echo "[e2e-stack] port $2 is busy; using $port for $var"
  fi
  export "$var=$port"
}

pick_port E2E_PG_PORT 5433
pick_port E2E_BACKEND_PORT 3002
pick_port E2E_FRONTEND_PORT 5174

export E2E_BASE_URL="http://localhost:${E2E_FRONTEND_PORT}"
export E2E_BACKEND_URL="http://localhost:${E2E_BACKEND_PORT}"

PW_VERSION=$(node -p "require('@playwright/test/package.json').version")
PW_MODE="${E2E_PLAYWRIGHT:-auto}"
if [ "$PW_MODE" = auto ]; then
  if node -e "process.exit(require('fs').existsSync(require('playwright-core').chromium.executablePath()) ? 0 : 1)" 2>/dev/null; then
    PW_MODE=local
  else
    PW_MODE=docker
    echo "[e2e-stack] Playwright's Chromium isn't installed here; running the suite in the Playwright ${PW_VERSION} container."
  fi
fi
case "$PW_MODE" in
  local | docker) ;;
  *)
    echo "[e2e-stack] ERROR: E2E_PLAYWRIGHT must be auto, local or docker (got '$PW_MODE')." >&2
    exit 2
    ;;
esac

COMPOSE="docker compose -f docker-compose.e2e.yml"

cleanup() {
  echo "[e2e-stack] tearing down…"
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[e2e-stack] building + starting the ephemeral stack (frontend :${E2E_FRONTEND_PORT}, backend :${E2E_BACKEND_PORT}, postgres :${E2E_PG_PORT})…"
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

wait_for backend "${E2E_BACKEND_URL}/api/health"
wait_for frontend "${E2E_BASE_URL}"

echo "[e2e-stack] running Playwright (${PW_MODE})…"
set +e
if [ "$PW_MODE" = docker ]; then
  # Host networking so localhost inside the container is the stack's
  # published ports. The repo (with its node_modules) is mounted; the image
  # supplies the browser. Run as the calling user so reports aren't root-owned.
  docker run --rm --network host --ipc host \
    --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -e CI -e E2E_BASE_URL -e E2E_BACKEND_URL \
    -v "$PWD:/work" -w /work \
    "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
    npx playwright test "$@"
else
  npx playwright test "$@"
fi
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo "[e2e-stack] PASS"
else
  echo "[e2e-stack] FAIL (exit ${status})" >&2
fi
exit "$status"
