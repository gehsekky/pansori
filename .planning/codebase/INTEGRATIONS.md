# External Integrations

**Analysis Date:** 2026-06-20

## APIs & External Services

**Authentication:**
- Google OAuth 2.0 - User login via Google accounts
  - SDK/Client: `passport-google-oauth20` 2.0.0
  - Auth env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
  - Gated registration: enabled only when both ID + secret are configured (`src/backend/src/auth/passport.ts` lines 96–119)
  
- Discord OAuth - User login via Discord accounts
  - SDK/Client: `passport-discord` 0.1.4
  - Auth env vars: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_CALLBACK_URL`
  - Gated registration: enabled only when both ID + secret are configured (`src/backend/src/auth/passport.ts` lines 122–152)

**Narrative Enhancement:**
- Anthropic Claude API - Optional LLM-based narrative prose generation
  - SDK/Client: `@anthropic-ai/sdk` 0.96.0
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Model: Configurable via `ANTHROPIC_MODEL` (defaults to `claude-haiku-4-5-20251001`)
  - Usage: Enhances game event descriptions to vivid, atmospheric prose (1–3 sentences)
  - Implementation: `src/backend/src/services/llmProvider.ts`
  - Fallback: If LLM request fails or output drops critical facts (damage values, outcomes), engine reverts to template narrative
  - Provider factory: Env var `LLM_PROVIDER=anthropic` enables; otherwise `NoneProvider` (passthrough)

## Data Storage

**Databases:**
- PostgreSQL 16
  - Connection: `DATABASE_URL` environment variable (format: `postgres://user:password@host:port/dbname`)
  - Client: `pg` 8.11.3 (Node.js PostgreSQL adapter)
  - Pool: Single shared connection pool at `src/backend/src/db/pool.ts`
  - Session store: `connect-pg-simple` 10.0.0 (Express session persistence in `session` table)
  - Migrations: Incremental SQL migrations in `src/backend/migrations/` (001–017 as of 2026-06-20)
  - Schema: User accounts, identities, campaign metadata, session state, game data

**File Storage:**
- Local filesystem only (no cloud storage integration)
- Campaign art/assets served via painted-art overlay mechanism: `pansori-assets` private repo (sibling checkout)
- Free tier uses glyph/color tint fallbacks; painted tier inlines `VITE_PAINTED_ART=1` at build time

**Caching:**
- None detected; all queries hit PostgreSQL directly

## Authentication & Identity

**Auth Provider:**
- Custom OAuth integration (Passport.js)
- Implementation: `src/backend/src/auth/passport.ts`
- Strategy: OAuth redirect flow (Google + Discord configurable)
- Session serialization: Provider-agnostic — keys by `users.id` (lines 154–168)
- User record: Unified `users` table + `user_identities` cross-reference (provider + provider_id)
- Account linking: Same email address across providers links to existing user
- E2E bypass: Test-only `/api/auth/test-login` endpoint (gated by `E2E_TEST_LOGIN_ENABLED=true` in non-prod)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, or similar)

**Logs:**
- Console output (stdout/stderr) from Node.js process
- Docker compose logs available via `npm run logs` / `npm run logs:be` / `npm run logs:fe`
- CloudTrail integration on EC2 deploy: SSM Session Manager commands are audited by AWS

## CI/CD & Deployment

**Hosting:**
- AWS EC2 (instance ID: `i-0cafb33230af17b59` in us-east-1)
- Deployment triggered by push to `main` branch
- Pull via AWS Systems Manager Session Manager (no SSH keys)

**Container Registry:**
- AWS ECR: `674162619498.dkr.ecr.us-east-1.amazonaws.com`
- Backend image: `pansori-backend:<commit-sha-8-chars>`
- Frontend image: `pansori-frontend:<commit-sha-8-chars>`
- Both built for ARM64 (`linux/arm64` platform)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/deploy.yml`)
- Stages:
  1. **test**: npm audit, typecheck, lint, prettier, unit tests (vitest)
  2. **e2e**: Playwright e2e suite on ephemeral docker-compose.e2e.yml stack
  3. **build-and-deploy**: Docker build → ECR push → EC2 deploy (if `vars.DEPLOY_ENABLED == 'true'`)

**Deployment Flow:**
1. GitHub Actions builds backend + frontend images with QEMU for ARM64 emulation
2. Images tagged by commit SHA, pushed to ECR
3. EC2 host pulls images via `docker login` (ECR credentials from AWS session)
4. Runs `docker compose -f docker-compose.prod.yml up -d` to update services
5. Old images pruned; disk space reclaimed before pull to avoid "no space left" errors

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - 64-char random string for session cookie encryption (fail-fast check at startup)
- `FRONTEND_URL` - URL for CORS + Socket.IO origin (e.g., `http://localhost:5173` dev, `https://pansori.example.com` prod)
- `NODE_ENV` - `development` or `production` (affects cookie.secure, CSP, auth bypass)

**Optional env vars (Auth):**
- `GOOGLE_CLIENT_ID` - Google OAuth app ID (provider disabled if unset)
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `GOOGLE_CALLBACK_URL` - OAuth redirect URI (defaults to `/api/auth/google/callback`)
- `DISCORD_CLIENT_ID` - Discord OAuth app ID (provider disabled if unset)
- `DISCORD_CLIENT_SECRET` - Discord OAuth secret
- `DISCORD_CALLBACK_URL` - OAuth redirect URI (defaults to `/api/auth/discord/callback`)

**Optional env vars (LLM):**
- `ANTHROPIC_API_KEY` - Claude API key (LLM enhancement disabled if unset)
- `LLM_PROVIDER` - `anthropic` or `none` (defaults to `none`)
- `ANTHROPIC_MODEL` - Claude model ID (defaults to `claude-haiku-4-5-20251001`)

**Optional env vars (Dev/Debug):**
- `E2E_TEST_LOGIN_ENABLED` - `true` to enable `/api/auth/test-login` endpoint in non-prod (defaults to `true`)
- `VITE_PAINTED_ART` - `1` to include licensed painted-art overlay (free tier if unset)
- `VITE_ASSET_BASE_URL` - CDN URL for painted art assets (defaults to local `/art/...`)
- `PGADMIN_EMAIL` - PgAdmin login email (defaults to `admin@pansori.local`)
- `PGADMIN_PASSWORD` - PgAdmin password (defaults to `admin`)

**Secrets location:**
- Development: `.env` file (gitignored, not committed)
- Production: `/opt/pansori/.env` on EC2 host (set by operator, persisted across deploys)

## Webhooks & Callbacks

**Incoming:**
- `/api/auth/google/callback` - Google OAuth redirect target
- `/api/auth/discord/callback` - Discord OAuth redirect target
- `/api/test/seed-campaign` - E2E test-only endpoint to self-seed ephemeral campaign
- `/api/auth/test-login` - E2E test-only login bypass (non-prod only)

**Outgoing:**
- None detected (no webhooks sent to external services)

## Rate Limiting

**Auth endpoints:**
- Rate limit: 30 requests per minute per IP
- Applied to `/api/auth/*` namespace to prevent credential-stuffing
- Window: 60 seconds
- Standard Headers: `RateLimit-*` draft-7 format

**Game endpoints:**
- Secondary limiter on game routes (mentioned in code but details truncated)

## Socket.IO Events

**Broadcast mechanism:** Backend uses Socket.IO rooms to emit state changes
- Sessions: Room key `session:${sessionId}` receives `state` event (game state updates)
- Campaigns: Room key `campaign:${campaignId}` receives `campaign-updated` event (metadata changes)
- Participants: Room key `session:${sessionId}:participants` receives `participants` event (join/leave)
- Implementation: `src/backend/src/services/broadcast.ts`

---

*Integration audit: 2026-06-20*
