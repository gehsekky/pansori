# Pansori E2E (Playwright)

End-to-end browser tests that drive the real frontend against the real backend
+ Postgres. These exist to validate integration paths that unit tests can't —
HTTP shape, session cookies, DB writes, UI rendering.

## The campaign is seeded, not shipped

The project ships **no built-in campaign**. Each test seeds a throwaway one
(`e2e-proving-grounds` — `src/backend/src/services/e2eCampaign.ts`) via the
gated `POST /api/test/seed-campaign` endpoint, then plays it. In the ephemeral
stack the database is discarded after the run, so nothing persists.

## Running (recommended)

```
npm run test:e2e:stack     # brings up an isolated ephemeral stack,
                           # runs the suite, tears it down (down -v)
```

This is the canonical entry point (and what CI runs). It uses
`docker-compose.e2e.yml` — its own project name, container names, and host
ports (frontend 5174, backend 3002, postgres 5433) — so it can run alongside
the dev stack without colliding. The stack runs the free art tier (no licensed
assets required).

## Running against an already-up stack

```
npm run test:e2e:install   # one-time: download Chromium (~115 MB)
# point at whatever stack is up (defaults shown):
E2E_BASE_URL=http://localhost:5173 E2E_BACKEND_URL=http://localhost:3001 npm run test:e2e
npm run test:e2e:headed    # with browser UI
```

Chromium also needs system libraries to launch headless. On Ubuntu/WSL:
`sudo apt-get install -y libasound2 libnspr4 libnss3` (or
`sudo npx playwright install-deps`).

## What's covered

`smoke.spec.ts`:

1. Auth bypass produces a working session; the throwaway campaign seeds.
2. Sessions screen renders.
3. + NEW ADVENTURE → character screen.
4. The (sole) seeded campaign is auto-selected.
5. Auto-fill recommended party (Fighter/Cleric/Rogue/Wizard).
6. BEGIN ADVENTURE transitions to game view; narrative panel populates.
7. Session resume survives a page reload.
8. Combat: travel to the practice ring, ignite combat, initiative strip shows
   4 PCs + 2 Goblin Warriors, and `cast_spell` surfaces iff the active PC is a
   spellcaster.

## What's *not* covered (yet)

- Reactive spell windows (Shield prompt)
- Faction price modifiers in shops
- Quest completion / escape

Expand only after a test earns its keep by catching a real regression — UI
churn is the #1 source of E2E maintenance cost.

## Auth bypass + seed endpoint — why they're safe

The `/api/auth/test-login` and `/api/test/seed-campaign` endpoints are both
double-gated:

- `NODE_ENV !== 'production'` (set to `production` in `docker-compose.prod.yml`)
- `E2E_TEST_LOGIN_ENABLED === 'true'` (not set in `docker-compose.prod.yml`)

Both conditions are required, and neither is set in prod. If a future change
exposes this in production, the second check ensures the wider auth surface
is still gated on Google OAuth.
