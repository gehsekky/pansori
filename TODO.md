# TODO

## Script Engine (core goal)
- [ ] Campaign persistence — world state that survives across multiple sessions (separate from per-session GameState)

## Rules Engine (D&D 5e gaps)
- [ ] Traps — core dungeon element entirely absent. Investigation/Perception to detect (vs trap DC), Thieves' Tools proficiency check to disarm, damage/condition on trigger. Defined in room data.
- [ ] Armor/weapon proficiency enforcement — currently any class can wear any armor with no penalty; heavy armor without proficiency should impose disadvantage on STR/DEX checks and prevent spellcasting
- [ ] Two-weapon fighting — bonus action attack with light off-hand weapon when wielding two light weapons; no ability mod to damage unless feat
- [ ] Grapple / Shove — contested Athletics checks: grapple sets target speed 0, shove knocks prone or pushes 5ft
- [ ] Backgrounds — grant 2 skill proficiencies + 1 tool proficiency + a narrative feature; add to character creation
- [ ] Magic item attunement — max 3 attuned items per character; some items require attunement to function

## Party System
- [ ] Starting loot distribution — currently all campaign starting items are duplicated to every party member; should distribute items across characters instead (e.g. round-robin or defined per-character in context).

## Features
- [ ] LLM narrative provider abstraction — pluggable `LLMProvider` interface (`generate(prompt, systemPrompt): Promise<string>`) with two implementations: `AnthropicProvider` (Anthropic SDK) and `LocalProvider` (Ollama, OpenAI-compatible REST). Selected via `LLM_PROVIDER=anthropic|local|none` env var. `none` falls back to existing deterministic templates. LLM enhances (rewrites) the template output string rather than generating from raw game state — keeps game logic deterministic, limits prompt complexity. `history` param in `takeAction` already stubbed for this. Deployment note: local mode needs Ollama running alongside the backend (same EC2 or sidecar); minimum practical instance is t3.large (8 GB RAM) for a 3B Q4 model — CPU inference will be 15–60s per call.
- [ ] Hard-coded text overrides - right now we use the same text template for certain actions like combat for all contexts. Maybe have the ability for a context to override these types of text for better immersion? Also, maybe these texts should support an array to further make each encounter feel unique.
- [ ] Add a way for items to be interactive. Maybe each room has an "items" array and item objects can be examined on their own separate from the room. For example, say we have a desk in a room. The desk can be examined, or inspected, and can possibly contain items as well. Need to check D&D 5e rules to see if there are any rules for object interaction. Can we destroy any item? Can we use items as weapons (eg. pick up desk and throw it at enemy)?
- [ ] Maybe templates for narrative generation so that the content can be displayed in a custom fashion? Right now we have meta game info (eg. dice roll outcomes, etc) in-line with narrative text. What if we could have a custom format to show that at the bottom somehow and keep the narrative text pure for immersion?
- [ ] `useGame` hook — extract all game state, API calls, and history management out of `App.tsx` into a `useGame` custom hook; App becomes a pure view router; hook exposes `{ gameState, choices, loading, handleAction, handleEquip, handleNewGame, handleResumeSession, ... }`.
- [ ] Checkpoint saves — store multiple state snapshots per session so players can rewind to before a bad decision
- [ ] Better documentation for game engine API and context capabilities
- [ ] Art asset manifest — generate a `public/art/manifest.json` at build time (or maintain manually) listing which image files exist per context; `RoomArtPanel` reads the manifest instead of trial-and-error extension probing, eliminating 404 waterfalls in the browser console.
- [ ] Multiplayer lobby (Socket.io rooms ready)
- [ ] Dynamic image generation for rooms and encounters using Google Nano Banana 2 api. Pros - Great experience. Cons - increased cost. Put behind env var flag so we can quickly turn it on and off.
- [ ] Sound effects
- [ ] CSS Modules — replace repeated inline style objects with CSS Modules (`.module.css`) for style organization; keep CSS custom properties for theming; low priority since the current approach works

## Deployment (AWS — t4g.micro EC2 + db.t4g.micro RDS)
- [ ] Production Dockerfiles — multi-stage builds for backend (compile TS → copy dist + node_modules to slim alpine image) and frontend (Vite build → nginx static serving); replace `Dockerfile.dev` in each package; build target is `linux/arm64` for Graviton2.
- [ ] `docker-compose.prod.yml` — production compose without dev volumes, hot-reload, or exposed dev ports; backend reads env vars from host; no postgres service (points at RDS instead).
- [ ] Environment variable strategy — document all required vars (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `NODE_ENV`, `CORS_ORIGIN`); store secrets in AWS SSM Parameter Store or Secrets Manager; inject into EC2 via instance profile + startup script (or ECS task definition secrets if containerised with ECS).
- [ ] Health check endpoint — add `GET /health` to the Express app returning `{ ok: true, uptime }` with no auth required; used by ALB target group health checks and basic uptime monitoring.
- [ ] RDS provisioning — `db.t4g.micro` PostgreSQL 16 in the same VPC as EC2; security group allows inbound 5432 only from the EC2 security group; enable automated backups (7-day retention); store connection string in SSM.
- [ ] Database schema migration on deploy — run `psql` or a migration script against RDS during the deployment step before the new container starts; ensure idempotent (`CREATE TABLE IF NOT EXISTS`, etc.); document the initial schema SQL.
- [ ] Nginx reverse proxy config — single nginx container (or host install) terminates SSL, serves frontend static files from `/`, and proxies `/api` to the backend container; config to live in `infra/nginx/nginx.conf`.
- [ ] SSL/TLS — use Let's Encrypt (Certbot + auto-renew cron) for a custom domain, or ACM + Application Load Balancer if budget allows; bare EC2 HTTP-only is not acceptable for production (JWT cookies, API keys in transit).
- [ ] ECR repository — create one repo each for `pansori-backend` and `pansori-frontend`; tag images with git SHA; push from CI.
- [ ] CI/CD pipeline (GitHub Actions) — on push to `main`: run tests, build `linux/arm64` images, push to ECR, SSH to EC2 and run `docker compose -f docker-compose.prod.yml pull && docker compose up -d --remove-orphans`.
- [ ] Security groups & VPC — EC2 inbound: 80 (redirect), 443 (HTTPS), 22 (SSH from your IP only); RDS inbound: 5432 from EC2 SG only; no public RDS endpoint.
- [ ] CloudWatch log groups — route Docker container stdout/stderr to CloudWatch via `awslogs` log driver; set 30-day retention; enables basic alerting without a full observability stack.
