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
- [X] Docker 25.0.14, Compose plugin v5.1.3, AWS CLI v2.33.15 installed; `ec2-user` in `docker` group
- [X] Create `/opt/pansori/` directory; copy `docker-compose.prod.yml` and `infra/nginx/nginx.conf` there
- [X] Create `/opt/pansori/.env` with all required vars (see list below)
- [X] SSM Session Manager registered (instance role has `AmazonSSMManagedInstanceCore`) — no SSH allowlist needed for ops

### Domain & TLS
- [X] Point domain A record at EC2 public IP
- [X] Replace `YOUR_DOMAIN` in `infra/nginx/nginx.conf` with the real domain (4 occurrences)
- [X] Cert issued for `pansorirpg.com` + `www.pansorirpg.com` (Let's Encrypt ECDSA, expires 2026-08-16)
- [X] Auto-renew via systemd `certbot-renew.timer` (daily 03:00 UTC + 1h jitter; webroot mode; deploy-hook reloads nginx)
- [X] `/var/www/certbot/` directory exists for ACME webroot challenges
- [X] Renewal config switched from `standalone` → `webroot` so nginx stays up during renew

### GitHub Actions wiring
- [X] Add repo secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (EC2_SSH_KEY no longer needed)
- [X] Workflow env vars: `AWS_REGION`, `ECR_REGISTRY`, `EC2_INSTANCE_ID`
- [X] Deploy step switched from `appleboy/ssh-action` to `aws ssm send-command` — no SSH allowlist, no key rotation, all commands audited in CloudTrail
- [X] `pansori-deploy` IAM user has `ssm:SendCommand` scoped to the pansori instance + `AWS-RunShellScript` document
- [X] `DEPLOY_ENABLED=true` repo variable is set — every push to `main` auto-deploys to prod after a successful build (verified end-to-end with image tag `733c3be7`)

### Google OAuth
- [X] Create Google Cloud project; enable People API
- [X] Configure OAuth consent screen (External); add `email` and `profile` scopes; add domain to Authorized Domains
- [X] Create OAuth credential (Web application); set Authorized redirect URI to `https://yourdomain.com/api/auth/google/callback`; copy Client ID + Secret into env
- [X] Publish the consent screen app when ready for real users

### Database
- [X] Schema/migrations auto-run on first `docker compose up` via `docker-entrypoint-initdb.d` (now mounted in `docker-compose.prod.yml`; 6 migrations applied on first init)

### Production deployment
- [X] First deploy successful (image tag `09b6e3f2`): postgres + backend + frontend + nginx all running, TLS terminating, API responding

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

## 6. Subclass Features — DONE
- [x] Champion: Improved Critical
- [x] Battle Master: maneuvers (Riposte, Feinting)
- [x] Thief: Fast Hands — Thief Rogue L3+ can `interact_object` as a bonus action in combat (extends out-of-combat free interaction)
- [x] Assassin: auto-crit on surprised
- [x] Evoker: Potent Cantrip
- [x] Abjurer: Arcane Ward
- [x] Life Cleric: Disciple of Life
- [x] War Cleric: War Priest + Guided Strike
- [x] Hunter Ranger: Colossus Slayer
- [x] Beastmaster: Animal Companion — Wolf companion (HP 11 / AC 13 / +4 to hit / 2d4+2) summons at combat start for Ranger L3+ Beastmasters; commanded via bonus action; rendered as a green token on the combat grid
- [x] Devotion Paladin: Sacred Weapon
- [x] Vengeance Paladin: Vow of Enmity + Abjure Enemy
- [x] Bard Lore: Cutting Words
- [x] Bard Valor: Combat Inspiration + Extra Attack

---

## 7. Vale of Shadows — Refactor & Playtest
- [x] Migrate enemies to the new array-per-room schema with stable IDs
- [x] Multi-enemy encounters added: Charnel Hall (2 skeletons), Crypt Throne (Crypt Lord + 2 skeleton minions), Road North (2 bandits)
- [x] Frontend context (`src/frontend/src/contexts/vale_of_shadows.tsx`) so Vale appears on the character creation screen — was previously backend-only and invisible
- [ ] Add a second campaign module to validate the authoring format is general-purpose
- [ ] End-to-end playtest — complete all 3 quests in a single session; verify campaign state survives session resume; verify faction price modifiers apply in shop

---

## Backlog (post-ship)
- [ ] Narrative template format — separate mechanical metadata (dice rolls, damage numbers, HP changes) from prose so the UI can render them differently while keeping immersion
- [ ] Dynamic room/encounter image generation — Google Imagen or similar behind `IMAGE_PROVIDER` env var flag; off by default
- [ ] Sound effects — ambient audio per location type (town, dungeon, wilderness); combat sound cues
- [x] Mobile UI support — `@media` breakpoints at 768 px and 480 px in `styles.module.css` stack two-column layouts vertically, enlarge tap targets on choice buttons, allow the combat grid to scroll horizontally, and tighten paddings. Desktop layout unchanged.

---

## 8. Inventory & UX
- [x] Single inventory modal (`InventoryModal.tsx`) — party tabs, equipment slot summary, equip/unequip, give-to-party-member transfer, drop, encumbrance footer (STR × 15 lbs capacity; tier labels shown but not enforced as speed penalty). Triggered by `I` keypress or header button.
- [ ] Multi-window inventory (deferred — single modal serves the core use case)
- [ ] Inventory enforcement of encumbrance speed penalties (deferred — needs game-feel decision)

---

## 9. 5e SRD 5.2.1 rule completeness
- [x] **Tactical fog of war** — per-cell lighting from PC torches + darkvision (SRD p.11 Vision and Light). Rooms can be `bright`/`dim`/`dark`. Vale dungeon rooms marked accordingly.
- [x] **Spell range enforcement** — `Spell.rangeKind` ('self'/'touch'/'ranged') + `rangeFt`. Out-of-range casts refunded; all sandbox + Vale spells tagged with SRD ranges.
- [x] **Quickened Spell restriction** (SRD p.67) — can't use Quickened if you've already cast a level 1+ spell this turn; can't cast a level 1+ spell after using Quickened.
- [x] **Death by Massive Damage** (SRD p.17) — single hit with leftover ≥ max HP = instant death, bypassing death saves. Wired into the enemy-turn loop.
- [x] **Drinking a potion is a Bonus Action** (SRD p.204) — `use` consumable consumes `bonus_action_used` instead of `action_used`; heal choices labelled and gated accordingly.
- [x] **Sneak Attack** tightened to RAW — requires finesse/ranged weapon; ally must be within 5 ft of target on the grid (or any living ally off-grid); no disadvantage.

Still open under §9:
- [ ] Encumbrance speed penalties (currently informational only)
- [ ] Multi-target spells (Magic Missile's 3 darts, Eldritch Blast's multiple beams at higher levels) — needs UX for target allocation
- [ ] AoE shapes beyond sphere (cone, line, cube) — needs geometry + per-spell shape tagging
- [ ] Inspiration (Heroic Inspiration in 2024) — needs UX for grant/spend
- [ ] Reactive spells as interrupts (Counterspell, Shield) — architectural: requires interrupt support in the turn engine
- [ ] Costly material component consumption (e.g. Identify's 100 gp pearl)