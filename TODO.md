# TODO
<!-- Priority order: ship → UI → content → polish → playtest -->

## 1. Deployment (AWS — t4g.small EC2 + db.t4g.micro RDS)

### AWS Console (one-time)
- [ ] ECR repositories — create `pansori-backend` and `pansori-frontend` repos in ECR; note the registry URL
- [ ] RDS provisioning — `db.t4g.micro` PostgreSQL 16 in same VPC as EC2; SG allows inbound 5432 from EC2 SG only; enable automated backups (7-day retention); no public endpoint
- [ ] Security groups — EC2 inbound: 22 (your IP only), 80, 443; RDS inbound: 5432 from EC2 SG only
- [ ] IAM instance profile — attach role with `CloudWatchLogsFullAccess` (or scoped policy) to EC2 so the `awslogs` Docker log driver can write
- [ ] CloudWatch log groups — create `/pansori/backend`, `/pansori/frontend`, `/pansori/nginx` with 30-day retention

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
- [ ] Run `psql $DATABASE_URL -f infra/db/schema.sql` once on first deploy to initialize the schema
- [ ] Run DB migration 006 — `006_campaign_state.sql` adds `campaign_states` table and `campaign_state_id` FK on `game_sessions`; must be applied before any campaign session is started

### Required environment variables
- `DATABASE_URL` — PostgreSQL connection string to RDS instance
- `SESSION_SECRET` — random 64-character string
- `ANTHROPIC_API_KEY` — `sk-ant-...`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth app credentials
- `GOOGLE_CALLBACK_URL` — `https://yourdomain.com/api/auth/google/callback`
- `FRONTEND_URL` — `https://yourdomain.com`
- `ECR_REGISTRY` — registry URL (e.g. `123456789.dkr.ecr.us-east-1.amazonaws.com`)
- `AWS_REGION` — e.g. `us-east-1`

---

## 2. Grid Combat UI
- [ ] Render entity positions on a grid in the frontend during combat
- [ ] Highlight reachable squares based on remaining movement budget
- [ ] Show entity HP bars, conditions, and initiative order in combat HUD
- [ ] Display position coordinates or grid overlay in combat choice labels

---

## 3. Multiple Enemies Per Room
- [ ] Extend `Seed.enemies` to support an array of enemy instances per room (or a `count` field on the template)
- [ ] `buildInitiativeOrder` supports multiple enemy entries per room
- [ ] Enemy turn auto-advance iterates all living enemy entities, not just one per room
- [ ] `generateChoices` emits one `attack` choice per living enemy entity with entity ID as target

---

## 4. Campaign UI
- [ ] Quest journal UI — panel showing active/completed quests, current step descriptions, and reward previews
- [ ] Faction reputation UI — display current rep and attitude tier per faction; visible in stats or a separate panel
- [ ] Town/district navigation UI — show district map choices and NPC locations within each district
- [ ] `accept_quest` as an explicit choice — show "Accept quest: <title>" in `generateChoices` when the active character is talking to a quest-giver NPC and the quest is not yet active
- [ ] NPC quest-giver indicator — mark NPCs who have available quests in the room description / choice labels

---

## 5. Missing Classes
- [ ] Druid — d8 hit die; WIS spellcasting + spell preparation; Wild Shape (simplified: temp HP = CR × 5, `shape_shifted` flag, lasts until temp HP gone or dismissed); STR/WIS saves (PHB p.64)
- [ ] Sorcerer — d6; CHA spellcasting; Sorcery Points pool (`class_resource_uses.sorcery_points = level`); Metamagic: Twinned Spell (1 pt, target a second creature), Quickened Spell (2 pts, cast as bonus action), Empowered Spell (1 pt, reroll up to CHA mod damage dice); CON/CHA saves (PHB p.99)
- [ ] Warlock — d8; CHA spellcasting; Pact Magic (separate `pact_slots` from `spell_slots`; all recharge on short rest; max 2 slots at L1–10); Eldritch Blast always known; Invocations: Agonizing Blast (add CHA mod to EB damage), Devil's Sight (ignore magical darkness); CHA/WIS saves (PHB p.105)
- [ ] Monk — d8; STR/DEX saves; Ki points (`class_resource_uses.ki_points = level`); Martial Arts unarmed die (d4→d6→d8→d10 by level); Unarmored Defense (AC = 10 + DEX + WIS); Flurry of Blows (2 unarmed strikes bonus action, 1 ki); Step of the Wind (Dash or Disengage bonus action, 1 ki); Stunning Strike (1 ki after hit, CON save DC = 8+prof+WIS or stunned); ki recharges on short rest (PHB p.78)
- [ ] Barbarian — d12; STR/CON saves; Rage (bonus action, 2/day at L1; +2 melee damage, resist bludgeoning/piercing/slashing, advantage STR; ends if no attack in a turn); Unarmored Defense (AC = 10 + DEX + CON); Reckless Attack (bonus action before first attack: advantage on all your attacks + advantage on all attacks against you until your next turn) (PHB p.46)

---

## 6. Subclass Features
- [ ] Fighter — Champion: Improved Critical (crit on 19–20); Remarkable Athlete (+½ prof to uninvested STR/DEX/CON checks) (PHB p.72)
- [ ] Fighter — Battle Master: Riposte (reaction attack after being hit + superiority die damage); Feinting Attack (bonus action advantage + superiority die damage); Goading Attack note: adds disadvantage vs non-caster, not implemented in enemy AI (PHB p.73)
- [ ] Rogue — Thief: Fast Hands (Use Object / activate magic item as bonus action); Second-Story Work (climbing costs no extra movement) (PHB p.97)
- [ ] Rogue — Assassin: Assassinate (advantage vs creatures who haven't acted in combat yet); auto-crit on surprised foes (PHB p.97)
- [ ] Wizard — Evoker: Potent Cantrip (add WIS mod to cantrip damage on successful save) (PHB p.117)
- [ ] Wizard — Abjurer: Arcane Ward (temp HP shield = 2 × wizard level; recharged by casting abjuration spells) (PHB p.115)
- [ ] Cleric — Life: Disciple of Life (healing spells restore extra 2 + spell level HP); Preserve Life Channel Divinity (distribute 5 × cleric level HP among nearby allies) (PHB p.60)
- [ ] Cleric — War: War Priest (bonus action weapon attack when taking Attack action; uses = WIS mod per long rest); Channel Divinity: Guided Strike (+10 to an attack roll) (PHB p.63)
- [ ] Ranger — Hunter: Hunter's Prey choice — Colossus Slayer (+1d8 first hit per turn vs bloodied target), Horde Breaker (extra attack vs adjacent creature), Giant Killer (reaction attack vs Large+ that misses you) (PHB p.93)
- [ ] Ranger — Beastmaster: Animal Companion (summon CR ¼ beast as a second `CombatEntity`; acts on Ranger's turn as bonus action) (PHB p.93)
- [ ] Paladin — Devotion: Sacred Weapon Channel Divinity (+CHA mod to attacks for 1 min); Aura of Devotion (L7: immune to charmed for party in 10 ft) (PHB p.86)
- [ ] Paladin — Vengeance: Vow of Enmity Channel Divinity (advantage vs one creature for 1 min); Abjure Enemy (frighten one creature, WIS save) (PHB p.88)
- [ ] Bard — Lore: Cutting Words reaction (subtract Bardic Inspiration die from enemy attack roll/damage/ability check); 3 bonus skill proficiencies (PHB p.54)
- [ ] Bard — Valor: Combat Inspiration (ally uses die for weapon damage or AC bonus); Extra Attack at L6 (PHB p.55)

---

## 7. Vale of Shadows — Refactor & Playtest
- [ ] Refactor Vale of Shadows campaign to leverage multi-enemy encounters, grid terrain, faction mechanics, and all new class/subclass features added since initial authoring
- [ ] Add a second campaign module to validate the authoring format is general-purpose
- [ ] End-to-end playtest — complete all 3 quests in a single session; verify campaign state survives session resume; verify faction price modifiers apply in shop

---

## Backlog (post-ship)
- [ ] Narrative template format — separate mechanical metadata (dice rolls, damage numbers, HP changes) from prose so the UI can render them differently while keeping immersion
- [ ] Dynamic room/encounter image generation — Google Imagen or similar behind `IMAGE_PROVIDER` env var flag; off by default
- [ ] Sound effects — ambient audio per location type (town, dungeon, wilderness); combat sound cues
