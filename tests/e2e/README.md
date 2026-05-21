# Pansori E2E (Playwright)

End-to-end browser tests that drive the real frontend against the real backend
+ Postgres. These exist to validate integration paths that unit tests can't —
HTTP shape, session cookies, DB writes, UI rendering.

## Prerequisites

1. **Dev stack running**: `npm run dev` from repo root. The compose file
   exports `E2E_TEST_LOGIN_ENABLED=true` to the backend, which exposes the
   dev-only `/api/auth/test-login` bypass that the tests use.

2. **Chromium browser binary**: `npm run test:e2e:install` downloads it
   (~115 MB). One-time setup.

3. **System libraries Chromium needs to launch headless**. Pick one path:

   **a) Install via apt (smallest)** — on Ubuntu/WSL:
   ```
   sudo apt-get install -y libasound2 libnspr4 libnss3
   ```
   Or let Playwright install everything: `sudo npx playwright install-deps`.

   **b) Run in the official Playwright docker image** (no host install
   required, ~1 GB image):
   ```
   docker run --rm --network host \
     -v "$(pwd)":/work -w /work \
     mcr.microsoft.com/playwright:v1.60.0-noble \
     npm run test:e2e
   ```
   `--network host` lets the container reach `localhost:5173` /
   `localhost:3001` on the dev compose stack.

## Running

```
npm run test:e2e           # headless
npm run test:e2e:headed    # with browser UI (needs path 3a)
```

## What's covered

Currently one smoke test: `vale-smoke.spec.ts`.

1. Auth bypass produces a working session.
2. Sessions screen renders.
3. + NEW ADVENTURE → character screen.
4. World picker selects Vale of Shadows.
5. Auto-fill recommended party.
6. BEGIN ADVENTURE transitions to game view.
7. Narrative panel populates.

## What's *not* covered (yet)

- Combat resolution end-to-end
- Reactive spell windows (Shield prompt)
- Session resume across reloads
- Faction price modifiers in shops
- Quest completion / escape

The smoke test is the floor. Expand only after it earns its keep by catching
a real regression — UI churn is the #1 source of E2E maintenance cost.

## Auth bypass — why it's safe

The `/api/auth/test-login` endpoint is double-gated:

- `NODE_ENV !== 'production'` (set to `production` in `docker-compose.prod.yml`)
- `E2E_TEST_LOGIN_ENABLED === 'true'` (not set in `docker-compose.prod.yml`)

Both conditions are required, and neither is set in prod. If a future change
exposes this in production, the second check ensures the wider auth surface
is still gated on Google OAuth.
