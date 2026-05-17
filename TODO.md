# TODO

## Script Engine (core goal)
- [x] Fixed map support — when mapType is campaign, skip procgen and use explicit room/connection/enemy/loot definitions from the script
- [ ] Event/trigger system — use a JSON rules engine (`json-rules-engine`) rather than pre-declared TypeScript hooks. Rules evaluate conditions against GameState facts after every StructuredAction; consequences use a finite action vocabulary (`add_narrative`, `set_flag`, `give_item`, `modify_hp`, `unlock_room`, `spawn_enemy`, `set_escape`). Solves unknown-hook extensibility without a scripting runtime and unblocks user-authored campaigns. Known 5e hooks (onEnterRoom, onKillEnemy, etc.) become rules with fact conditions rather than named callsites. Procedural logic (dice-dependent branching) should write outcomes to flags before rule evaluation so rules only check state facts.
- [ ] Multiple win conditions — scripts define custom victory conditions beyond "reach escape room"
- [ ] NPC system — non-enemy characters with scripted dialogue trees
- [ ] Campaign persistence — world state that survives across multiple sessions (separate from per-session GameState)
- [ ] Dynamic script discovery — scan a scripts/ directory at startup instead of hardcoded imports

## Features
- [ ] Sound effects
- [ ] CSS Modules — replace repeated inline style objects with CSS Modules (`.module.css`) for style organization; keep CSS custom properties for theming; low priority since the current approach works
- [ ] Checkpoint saves — store multiple state snapshots per session so players can rewind to before a bad decision
- [x] Persistent saves with resume — all sessions auto-saved after every action; session list screen lets users resume any active run
- [ ] Multiplayer lobby (Socket.io rooms ready)
- [ ] LLM narrative provider abstraction — pluggable `LLMProvider` interface (`generate(prompt, systemPrompt): Promise<string>`) with two implementations: `AnthropicProvider` (Anthropic SDK) and `LocalProvider` (Ollama, OpenAI-compatible REST). Selected via `LLM_PROVIDER=anthropic|local|none` env var. `none` falls back to existing deterministic templates. LLM enhances (rewrites) the template output string rather than generating from raw game state — keeps game logic deterministic, limits prompt complexity. `history` param in `takeAction` already stubbed for this. Deployment note: local mode needs Ollama running alongside the backend (same EC2 or sidecar); minimum practical instance is t3.large (8 GB RAM) for a 3B Q4 model — CPU inference will be 15–60s per call.
- [x] Add world map visualization
- [x] Add keybindings for the options so a user can use a keyboard to navigate the game
- [x] Non-combat class abilities — medicine healing bonus, arcana/investigation item identification
- [x] User login system — Google SSO with session persistence and user ownership of game sessions
- [x] Portrait / avatar selection — Google SSO avatar as default + SVG silhouette options
- [x] Session list screen — all user runs with resume capability (Option A)
- [x] High school zombie context — backend + frontend + registration
- [x] Fix ballistic shield equip bug — derive equippability from item.slot/item.damage instead of lookup maps
- [x] Remove redundant weaponNames/armorNames frontend lookup maps

## Party System
- [x] Party support — `GameState` refactored to `characters: Character[]` + `active_character_id`; `normalizeState()` handles old flat saves; party builder UI (up to 4 characters); `PartyPanel` with character tabs; TPK vs single-death game-over logic; `advanceActiveCharacter()` round-robin turn advancement
- [ ] Initiative-based turn order — current model conflates player action + enemy counter into one step, which breaks down with parties and blocks class features. Implement a hybrid initiative queue: roll initiative for all participants (players + enemies) at combat start, show an order strip in the UI, advance one participant per step, auto-resolve enemy turns in sequence. One action + one bonus action per turn per participant. Reactions (opportunity attack, Shield spell, Counterspell) triggered by events during another participant's turn.
- [ ] Party UI improvements — initiative order strip showing all combatants in turn sequence; clearer active-turn indicator (glow/border on active character tab); condition badges on character tabs (poisoned, stunned, etc.); greyed-out "waiting" state for characters who already acted this round; multi-target choices for healing (choose which party member to heal)

## Rules Engine (D&D 5e gaps)
- [ ] Spell system — spell slots (levels 1–9, recovery on long rest), spell attack rolls (8 + prof + spellcasting ability), spell save DCs, cantrips, concentration (CON save on damage to maintain)
- [ ] Short rest / long rest — short rest: available anywhere with no active enemy in current room, spend one hit die (roll + CON mod) to recover HP, max once per room visit; long rest: designated safe room only, fully restores HP but may alert/respawn enemies to increase run difficulty. Long rest recovers half max hit dice (rounded down) and all spell slots. Only one long rest per 24 hours benefits you.
- [ ] Hit dice — per-class die (d6 Wizard, d8 Cleric/Rogue, d10 Fighter/Ranger, d12 Barbarian), tracked per level, spent on short rest; add `hit_dice_remaining` to Character; recovered on long rest (half max, rounded down)
- [ ] Saving throw proficiencies — each class has 2 save proficiencies (e.g. Fighter: STR+CON, Rogue: DEX+INT). Currently all saves are flat ability checks. Add to classSavingThrows in Context and apply proficiency bonus.
- [ ] Ability Score Improvements — at levels 4, 8, 12, 16, 19: +2 to one stat or +1 to two. Currently leveling only adds max HP.
- [ ] Multiple attacks — Extra Attack at level 5 for Fighter/Barbarian/Paladin/Ranger; level 11 for Fighter (3 attacks), level 20 (4). Significant combat shift.
- [ ] Class features — at minimum: Sneak Attack (Rogue, +Xd6 on advantage or ally adjacent), Rage (Barbarian, bonus damage + resistance), Divine Smite (Paladin, expend spell slot for bonus radiant damage), Bardic Inspiration (d6 bonus to ally roll)
- [ ] Full conditions list — missing: blinded (attacks have disadv, attackers have adv), charmed (can't attack charmer), exhaustion (6 levels, cumulative penalties), invisible (adv on attacks, disadv against), restrained (speed 0, disadv on attacks, adv against), incapacitated (no actions/reactions), grappled (speed 0), petrified
- [ ] Traps — core dungeon element entirely absent. Investigation/Perception to detect (vs trap DC), Thieves' Tools proficiency check to disarm, damage/condition on trigger. Defined in room data.
- [ ] Two-weapon fighting — bonus action attack with light off-hand weapon when wielding two light weapons; no ability mod to damage unless feat
- [ ] Grapple / Shove — contested Athletics checks: grapple sets target speed 0, shove knocks prone or pushes 5ft
- [ ] Armor/weapon proficiency enforcement — currently any class can wear any armor with no penalty; heavy armor without proficiency should impose disadvantage on STR/DEX checks and prevent spellcasting
- [ ] Backgrounds — grant 2 skill proficiencies + 1 tool proficiency + a narrative feature; add to character creation
- [ ] Magic item attunement — max 3 attuned items per character; some items require attunement to function
- [ ] Bonus action enforcement — partial via turn_actions but not enforced for all sources (two-weapon fighting, class features, some spells)
- [ ] Rules engine spec-conformance tests — current tests verify function behavior/shapes but not 5e spec values. Add anchored tests: `profBonus` exact values per level (2 at 1–4, 3 at 5–8, etc.); attack roll formula `d20 + ability mod + profBonus vs AC`; death save nat-1 counts as two failures, nat-20 restores 1 HP; advantage/disadvantage rolls exactly two d20s and takes max/min; spell save DC formula `8 + profBonus + spellcasting mod`.
- [x] Rules engine separation audit — moved ADVANTAGE_CONDITIONS, DISADV_CONDITIONS, rollConditionSave, resolveSaveWithAdvantage, resolveMysteryConsumable, passivePerceptionDC to rulesEngine.ts
- [x] Conditions system (poisoned, stunned, prone, paralyzed, frightened) — on-hit saving throws, attack blocking, advantage/disadvantage, cleared on combat end
- [x] Full enemy stat blocks — dungeon-crawler: Mummy, Banshee, Vampire Spawn, Lich; scifi-terror: Face-Hugger, Space Pirate, Mutant Horror, Security Mech
