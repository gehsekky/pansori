# TODO
<!-- Priority order: ship → UI → content → polish → playtest -->

## 1. Deployment (AWS — t4g.small EC2 + db.t4g.micro RDS)

### AWS Console (one-time)
- [x] ECR repositories — `pansori-backend` and `pansori-frontend` created
- [x] Security groups — EC2 inbound: 22 (your IP only), 80, 443; RDS SG created (pansori-rds)
- [x] IAM instance profile — `pansori-ec2-role` with CloudWatchLogsFullAccess attached to instance
- [x] CloudWatch log groups — `/pansori/backend`, `/pansori/frontend`, `/pansori/nginx`, `/pansori/postgres` with 30-day retention
- [x] IAM deploy user — `pansori-deploy` created with ECR push permissions

### EC2 bootstrap (SSH in once)
- [ ] Install Docker, Docker Compose plugin, and AWS CLI on the instance; add `ec2-user` to the `docker` group
- [ ] Create `/opt/pansori/` directory; copy `docker-compose.prod.yml` and `infra/nginx/nginx.conf` there
- [ ] Create `/opt/pansori/.env` with all required vars (see list below)

### Domain & TLS
- [ ] Point domain A record at EC2 public IP
- [ ] Replace `YOUR_DOMAIN` in `infra/nginx/nginx.conf` with the real domain (4 occurrences)
- [ ] Run Certbot on EC2: `certbot certonly --webroot -w /var/www/certbot -d yourdomain.com`
- [ ] Add auto-renew cron: `0 3 * * * root certbot renew --quiet`

### GitHub Actions wiring
- [ ] Add repo secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `EC2_SSH_KEY`
- [ ] Fill in the three TODOs at the top of `.github/workflows/deploy.yml`: `AWS_REGION`, `ECR_REGISTRY`, `EC2_HOST`

### Google OAuth
- [ ] Create Google Cloud project; enable People API
- [ ] Configure OAuth consent screen (External); add `email` and `profile` scopes; add domain to Authorized Domains
- [ ] Create OAuth credential (Web application); set Authorized redirect URI to `https://yourdomain.com/api/auth/google/callback`; copy Client ID + Secret into env
- [ ] Publish the consent screen app when ready for real users

### Database
- [ ] Schema and migrations run automatically on first `docker compose up` via `docker-entrypoint-initdb.d`

### Required environment variables (`/opt/pansori/.env` on EC2)
- `POSTGRES_PASSWORD` — strong password for the containerized postgres instance
- `POSTGRES_USER` — `pansori` (default)
- `POSTGRES_DB` — `pansori_db` (default)
- `SESSION_SECRET` — random 64-character string
- `ANTHROPIC_API_KEY` — `sk-ant-...`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth app credentials
- `GOOGLE_CALLBACK_URL` — `https://yourdomain.com/api/auth/google/callback`
- `FRONTEND_URL` — `https://yourdomain.com`
- `ECR_REGISTRY` — `674162619498.dkr.ecr.us-east-1.amazonaws.com`
- `AWS_REGION` — `us-east-1`

---

## 2. Grid Combat UI
- [x] Render entity positions on a grid in the frontend during combat — `GridCombatView.tsx`
- [x] Highlight reachable squares based on remaining movement budget
- [x] Show entity HP bars, conditions, and initiative order in combat HUD (HP bars + condition badges on tokens; `InitiativeStrip` already shows order)
- [x] Display position coordinates in `grid_move` choice labels (already in `generateChoices`)

---

## 3. Multiple Enemies Per Room
- [x] `Seed.enemies` is now `Record<roomId, Enemy[]>`; each enemy has a stable `id`
- [x] `buildInitiativeOrder` rolls per-enemy initiative
- [x] Enemy turn loop iterates by entity id (`getEnemyById`); each living enemy acts
- [x] `generateChoices` emits one attack/grapple/shove choice per living enemy with `targetEnemyId`
- [x] Combat ends only when all enemies in the room are dead (`isRoomCleared`)

---

## 4. Campaign UI
- [x] Quest journal UI — `CampaignPanel.tsx` (quests tab, status badges, step checklist)
- [x] Faction reputation UI — `CampaignPanel.tsx` (factions tab; attitude tier + rep value)
- [x] Town/district navigation choices — `generateChoices` emits `travel` and `enter_district`
- [x] `accept_quest` as an explicit choice — emitted when active char is next to a quest-giver NPC with an unaccepted quest
- [x] NPC quest-giver indicator — `[!]` suffix on Talk label when NPC has an unaccepted quest

---

## 5. Missing Classes — DONE (verified in audit; defined in `sandbox.ts`, handler logic in `gameEngine.ts`)
- [x] Druid (wild_shape, spell prep)
- [x] Sorcerer (sorcery points, Metamagic dispatch)
- [x] Warlock (pact slots, Agonizing Blast)
- [x] Monk (ki points, Flurry of Blows, Step of the Wind, Unarmored Defense)
- [x] Barbarian (rage, Unarmored Defense)
- [x] Barbarian Reckless Attack — `reckless_attack` class-feature toggle; advantage on STR melee, enemies get advantage vs you until your next turn

---

## 6. Subclass Features — MOSTLY DONE (verified in audit)
- [x] Champion: Improved Critical
- [x] Battle Master: maneuvers (Riposte, Feinting)
- [x] Thief: Fast Hands — Thief Rogue L3+ can `interact_object` as a bonus action in combat (extends out-of-combat free interaction)
- [x] Assassin: auto-crit on surprised
- [x] Evoker: Potent Cantrip
- [x] Abjurer: Arcane Ward
- [x] Life Cleric: Disciple of Life
- [x] War Cleric: War Priest + Guided Strike
- [x] Hunter Ranger: Colossus Slayer
- [ ] Beastmaster: Animal Companion — still missing
- [x] Devotion Paladin: Sacred Weapon
- [x] Vengeance Paladin: Vow of Enmity + Abjure Enemy
- [x] Bard Lore: Cutting Words
- [x] Bard Valor: Combat Inspiration + Extra Attack

---

## 7. Vale of Shadows — Refactor & Playtest
- [x] Migrate enemies to the new array-per-room schema with stable IDs
- [x] Multi-enemy encounters added: Charnel Hall (2 skeletons), Crypt Throne (Crypt Lord + 2 skeleton minions), Road North (2 bandits)
- [ ] Add a second campaign module to validate the authoring format is general-purpose
- [ ] End-to-end playtest — complete all 3 quests in a single session; verify campaign state survives session resume; verify faction price modifiers apply in shop

---

## Backlog (post-ship)
- [ ] Narrative template format — separate mechanical metadata (dice rolls, damage numbers, HP changes) from prose so the UI can render them differently while keeping immersion
- [ ] Dynamic room/encounter image generation — Google Imagen or similar behind `IMAGE_PROVIDER` env var flag; off by default
- [ ] Sound effects — ambient audio per location type (town, dungeon, wilderness); combat sound cues
