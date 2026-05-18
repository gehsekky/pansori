# TODO

## Campaign Engine
- [x] Campaign persistence — `CampaignState` JSONB in `campaign_states` table; load/merge/save around every action; survives across sessions (migration `006_campaign_state.sql`)
- [x] Grid combat — Chebyshev distance, BFS pathfinding, range-gated attacks, opportunity attacks, movement budget; `gridEngine.ts`; entity positions tracked in `GameState.entities`
- [x] Quest system — `Quest` / `QuestStep` / `QuestProgress` types; `evaluateQuestSteps` via json-rules-engine; auto-advance on step completion; rewards (gold, items, faction rep)
- [x] Faction reputation — numeric rep per faction; attitude tiers (hostile → exalted); shop price modifiers per tier; `factionAttitude` / `factionShopPrice` in `campaignEngine.ts`
- [x] Location hierarchy — `Location` (town / dungeon / wilderness) with `District` sub-areas; `travel` and `enter_district` actions; wilderness encounter rolls on travel
- [x] Vale of Shadows — first adventure module: Millhaven (3 districts, 5 NPCs), Shattered Crypt (8 rooms, 10×10 grid, 3 enemy types, Crypt Lord boss), 3 quests, 2 factions (`vale_of_shadows.ts`)
- [ ] Grid combat UI — frontend needs to render entity positions on the grid, show movement range highlight, and display position in combat choices
- [ ] Quest journal UI — panel showing active/completed quests, current step descriptions, and reward previews
- [ ] Faction reputation UI — display current rep and attitude tier per faction; visible in stats or a separate panel
- [ ] Town/district navigation UI — show district map choices and NPC locations within each district
- [ ] `accept_quest` as an explicit choice — show "Accept quest: <title>" in `generateChoices` when the active character is talking to a quest-giver NPC and the quest is not yet active
- [ ] NPC quest-giver indicator — mark NPCs who have available quests in the room description / choice labels
- [ ] Vale of Shadows end-to-end playtest — complete all 3 quests in a single session; verify campaign state survives session resume; verify faction price modifiers apply in shop
- [ ] Multiple campaign modules — second context beyond Vale of Shadows to validate the authoring format is general-purpose

## Rules Engine (D&D 5e gaps)
- [x] Armor/weapon proficiency enforcement — disadvantage on STR/DEX attack rolls and checks when wearing non-proficient armor; no prof bonus for non-proficient weapons; spellcasting blocked in non-proficient armor (PHB p.144/147)
- [x] Ranged weapons use DEX — `resolvePlayerAttack` now takes a `ranged` param; ranged weapons always use DEX for attack and damage (PHB p.194)
- [x] Two-weapon fighting — bonus action off-hand attack when both weapons are `light`; no ability modifier to damage; `resolveOffHandAttack` in rulesEngine (PHB p.195)
- [x] Grapple / Shove — contested STR Athletics check vs enemy STR/DEX; grapple applies `enemy_conditions: ['grappled']` (player advantage); shove applies `prone` (melee adv, ranged disadv); cleared on room change or kill (PHB p.195)
- [x] Magic item attunement — `requiresAttunement` on LootItem; `attuned_items` on Character; `attune` out-of-combat action; max 3; equip route blocks un-attuned use (PHB p.136)
- [x] Exhaustion full levels — level 1: skill check disadvantage; level 3: attack disadvantage (existing); level 4: max HP halved; level 6: instant death (PHB p.291)
- [x] Concentration spells — `concentration: true` on SpellDefinition; track `concentrating_on: { spellId, duration } | null` on Character; taking damage requires CON save (DC = max(10, damage/2)) or lose concentration; casting a new concentration spell ends the old one (PHB p.203)
- [x] Dodge / Disengage actions — Dodge: action, until next turn attacks against character have disadvantage; Disengage: action, no opportunity attacks triggered this turn; both cost `action_used`; add choices in non-bonus action pool (PHB p.192)
- [x] Damage types + resistances / vulnerabilities / immunities — `damage_type` field on weapon/spell attacks; `resistances`, `vulnerabilities`, `immunities` string arrays on EnemyTemplate; apply ×0.5 / ×2 / ×0 multipliers before HP deduction (PHB p.197)
- [x] Condition immunities — `condition_immunities: string[]` on EnemyTemplate; skip applying grappled/prone/poisoned/paralyzed/etc. to immune enemies (PHB p.290)
- [x] Enemy multiattack — `multiattack: number` on EnemyTemplate (default 1); loop `resolveEnemyAttack` N times per enemy turn; each hit generates its own narrative line (PHB Monster Manual stat blocks)
- [x] Action Surge (Fighter) — once per short rest; doubles available actions for one turn; tracked in `class_resource_uses.action_surge`; restored on short or long rest (PHB p.72)
- [x] Rogue Cunning Action — bonus action Dash, Disengage, or Hide; `cunning_action_dash/disengage/hide` feature IDs; choices injected in `generateChoices` for Rogue L2+ (PHB p.96)
- [x] Second Wind (Fighter) — bonus action heal 1d10+level; tracked in `class_resource_uses.second_wind`; recharges on short or long rest (PHB p.72)
- [x] Action economy — Dash, Help, Ready, Use Reaction as first-class actions; `readied_action` stored on `turn_actions`; reaction fires the stored action recursively (PHB p.192–193)
- [x] Spell upcasting / cantrip scaling — `upcastDamage(spell, slotLevel)` and `cantripDamageDice(spell, charLevel)` in rulesEngine; wired into `cast_spell` for all damage branches (PHB p.201, p.107)
- [x] Spell preparation — Cleric/Paladin/Druid block casting unprepared leveled spells; `prepare_spells` action available out of combat; cap = level + spellcasting mod (PHB p.201)
- [x] Ritual casting — no slot consumed; only out of combat; blocked if `spell.ritualCasting` is false (PHB p.202)
- [x] Cover — `coverBonus()` adds 0/+2/+5 to enemy AC based on blocking entities; applied in `attack` case when grid entities are present (PHB p.196)
- [x] Flanking — `isFlankingPosition()` grants advantage when attacker and ally are on opposite sides of target (PHB optional rule)
- [x] Difficult terrain — `Room.difficultTerrain: GridPos[]`; `grid_move` uses terrain-aware path cost (2× per difficult square) instead of flat `pathCostFeet` (PHB p.182)
- [x] Short-rest resource recharge — `short_rest` now clears second_wind, action_surge (Fighter), bardic_inspiration (Bard L5+), ki_points (Monk), superiority_dice (Battle Master), and restores Warlock pact slots (PHB p.186)
- [x] Subclass selection — `select_subclass` action; `char.subclass` field; choices offered at appropriate level in `generateChoices`
- [x] Thrown weapons — `LootItem.thrown: { normalRange, longRange }`; `inRange` uses longRange for out-of-hand melee weapons cast as ranged (PHB p.147)
- [x] Charmed condition — `cast_spell` and `attack` case block targeting the charmer when `char.charmer_id` matches (PHB p.290)
- [x] Deafened condition — blocks casting spells with `verbal: true` component (PHB p.290)
- [x] Unconscious condition — `attack` case auto-crits within melee range of unconscious enemies (PHB p.198)
- [ ] AOE spells on grid — `spell.blastRadius` typed; `entitiesInBlast` exists in gridEngine; wire into `cast_spell` so the spell hits all entities in radius with individual saves; Evoker Sculpt Spells lets allies auto-succeed (PHB p.202)
- [ ] Thrown weapon disadvantage past normal range — `resolvePlayerAttack` in the `attack` case never applies disadvantage when a thrown weapon is used beyond its `normalRange`; need to detect this and set `disadvantage = true` (PHB p.147)
- [ ] Upcasting choice generation — `generateChoices` emits one spell choice at base slot level; for spells with `upcastBonus`, emit one additional choice per available slot level above the base (e.g. "Cast Fireball (4th) — upcast +1d6") (PHB p.201)
- [ ] Spell slot initialization at session load — `spellSlotsForClassLevel` exists but is never called at session start or `normalizeState`; sessions loaded from DB may have stale or missing slot counts; call it during `normalizeState` for any character whose `spell_slots_max` is empty (PHB class tables)
- [ ] Petrified condition — typed but not enforced; should: incapacitate the entity (block actions), apply resistance to all damage types (`'*'` wildcard in `applyDamageMultiplier`), auto-fail STR/DEX saves (PHB p.291)
- [ ] Surprise round — `GameState.surprised?: string[]` typed; on combat start, compare party average Stealth vs. enemy Perception; add surprised enemy IDs to the array; skip action generation for surprised entities in round 1; clear at start of round 2 (PHB p.189)
- [ ] Ammunition tracking — `LootItem.ammo?: { type, count }` scoped; ranged attacks should find matching ammo in inventory, decrement count by 1, and block the attack if count is 0 (PHB p.146)
- [ ] HP rolled on level-up — currently fixed +4 per level; should roll `hit_die` + CON mod, minimum 1; add option in level-up flow (PHB p.15)
- [ ] Initiative-interleaved enemy turns on grid — enemies currently counter-attack within the player's action; true initiative order should give each entity a full independent turn (PHB p.189)

### Subclasses — wired but feature-incomplete
- [ ] Fighter — Champion: Improved Critical (crit on 19–20); Remarkable Athlete (+½ prof to uninvested STR/DEX/CON checks) (PHB p.72)
- [ ] Fighter — Battle Master: Riposte (reaction attack after being hit + superiority die damage); Feinting Attack (bonus action advantage + superiority die damage); Goading Attack note: adds disadvantage vs non-caster, not implemented in enemy AI (PHB p.73)
- [ ] Rogue — Thief: Fast Hands (Use Object / activate magic item as bonus action); Second-Story Work (climbing costs no extra movement) (PHB p.97)
- [ ] Rogue — Assassin: Assassinate (advantage vs creatures who haven't acted in combat yet); auto-crit on surprised foes (PHB p.97)
- [ ] Wizard — Evoker: Sculpt Spells (chosen allies auto-succeed DEX saves vs your AOE spells); Potent Cantrip (add WIS mod to cantrip damage on successful save) (PHB p.117)
- [ ] Wizard — Abjurer: Arcane Ward (temp HP shield = 2 × wizard level; recharged by casting abjuration spells) (PHB p.115)
- [ ] Cleric — Life: Disciple of Life (healing spells restore extra 2 + spell level HP); Preserve Life Channel Divinity (distribute 5 × cleric level HP among nearby allies) (PHB p.60)
- [ ] Cleric — War: War Priest (bonus action weapon attack when taking Attack action; uses = WIS mod per long rest); Channel Divinity: Guided Strike (+10 to an attack roll) (PHB p.63)
- [ ] Ranger — Hunter: Hunter's Prey choice — Colossus Slayer (+1d8 first hit per turn vs bloodied target), Horde Breaker (extra attack vs adjacent creature), Giant Killer (reaction attack vs Large+ that misses you) (PHB p.93)
- [ ] Ranger — Beastmaster: Animal Companion (summon CR ¼ beast as a second `CombatEntity`; acts on Ranger's turn as bonus action) (PHB p.93)
- [ ] Paladin — Devotion: Sacred Weapon Channel Divinity (+CHA mod to attacks for 1 min); Aura of Devotion (L7: immune to charmed for party in 10 ft) (PHB p.86)
- [ ] Paladin — Vengeance: Vow of Enmity Channel Divinity (advantage vs one creature for 1 min); Abjure Enemy (frighten one creature, WIS save) (PHB p.88)
- [ ] Bard — Lore: Cutting Words reaction (subtract Bardic Inspiration die from enemy attack roll/damage/ability check); 3 bonus skill proficiencies (PHB p.54)
- [ ] Bard — Valor: Combat Inspiration (ally uses die for weapon damage or AC bonus); Extra Attack at L6 (PHB p.55)

### Missing classes entirely
- [ ] Druid — d8 hit die; WIS spellcasting + spell preparation; Wild Shape (simplified: temp HP = CR × 5, `shape_shifted` flag, lasts until temp HP gone or dismissed); STR/WIS saves (PHB p.64)
- [ ] Sorcerer — d6; CHA spellcasting; Sorcery Points pool (`class_resource_uses.sorcery_points = level`); Metamagic: Twinned Spell (1 pt, target a second creature), Quickened Spell (2 pts, cast as bonus action), Empowered Spell (1 pt, reroll up to CHA mod damage dice); CON/CHA saves (PHB p.99)
- [ ] Warlock — d8; CHA spellcasting; Pact Magic (separate `pact_slots` from `spell_slots`; all recharge on short rest; max 2 slots at L1–10); Eldritch Blast always known; Invocations: Agonizing Blast (add CHA mod to EB damage), Devil's Sight (ignore magical darkness); CHA/WIS saves (PHB p.105)
- [ ] Monk — d8; STR/DEX saves; Ki points (`class_resource_uses.ki_points = level`); Martial Arts unarmed die (d4→d6→d8→d10 by level); Unarmored Defense (AC = 10 + DEX + WIS); Flurry of Blows (2 unarmed strikes bonus action, 1 ki); Step of the Wind (Dash or Disengage bonus action, 1 ki); Stunning Strike (1 ki after hit, CON save DC = 8+prof+WIS or stunned); ki recharges on short rest (PHB p.78)
- [ ] Barbarian — d12; STR/CON saves; Rage (bonus action, 2/day at L1; +2 melee damage, resist bludgeoning/piercing/slashing, advantage STR; ends if no attack in a turn); Unarmored Defense (AC = 10 + DEX + CON); Reckless Attack (bonus action before first attack: advantage on all your attacks + advantage on all attacks against you until your next turn) (PHB p.46)

## Features
- [x] Art asset manifest — `scripts/gen-art-manifest.mjs` runs at `predev`/`prebuild` and writes `src/art-manifest.json`; `RoomArtPanel` does a single lookup instead of trial-and-error extension probing
- [x] Interactive room objects — rooms define an `objects` array; `interact_object` action triggers an Investigation DC check; `lootIds[]` distributes found items; `objects_searched` tracks which have been opened
- [ ] Narrative template format — separate mechanical metadata (dice rolls, damage numbers, HP changes) from prose so the UI can render them differently while keeping immersion
- [ ] Dynamic room/encounter image generation — Google Imagen or similar behind `IMAGE_PROVIDER` env var flag; especially valuable for campaign locations (town square, dungeon rooms); off by default
- [ ] Sound effects — ambient audio per location type (town, dungeon, wilderness); combat sound cues

## Deployment (AWS — t4g.micro EC2 + db.t4g.micro RDS)
- [ ] Run DB migration 006 — `006_campaign_state.sql` adds `campaign_states` table and `campaign_state_id` FK on `game_sessions`; must be applied before any campaign session is started
- [ ] Environment variable strategy — document all required vars; store secrets in AWS SSM Parameter Store; inject into EC2 via startup script; write a `scripts/ssm-push.sh` helper
- [ ] ECR repositories — create `pansori-backend` and `pansori-frontend` repos; update `deploy.yml` placeholders with real ARNs
- [ ] RDS provisioning — `db.t4g.micro` PostgreSQL 16 in the same VPC; SG allows inbound 5432 from EC2 SG only; automated backups (7-day); connection string in SSM
- [ ] SSL/TLS — Certbot + Let's Encrypt on EC2 with auto-renew cron; bare HTTP is not acceptable for production (cookies, API keys in transit)
- [ ] Security groups & VPC — EC2 inbound: 80 (redirect), 443, 22 (your IP only); RDS inbound: 5432 from EC2 SG only; no public RDS endpoint
- [ ] CloudWatch log groups — already wired via `awslogs` driver in `docker-compose.prod.yml`; just needs log groups created and 30-day retention policy set
