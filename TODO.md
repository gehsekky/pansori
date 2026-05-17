# TODO

## Script Engine (core goal)
- [x] Event/trigger system — use a JSON rules engine (`json-rules-engine`) rather than pre-declared TypeScript hooks. Rules evaluate conditions against GameState facts after every StructuredAction; consequences use a finite action vocabulary (`add_narrative`, `set_flag`, `give_item`, `modify_hp`, `unlock_room`, `spawn_enemy`, `set_escape`). Solves unknown-hook extensibility without a scripting runtime and unblocks user-authored campaigns. Known 5e hooks (onEnterRoom, onKillEnemy, etc.) become rules with fact conditions rather than named callsites. Procedural logic (dice-dependent branching) should write outcomes to flags before rule evaluation so rules only check state facts.
- [x] Dynamic script discovery — scan a scripts/ directory at startup instead of hardcoded imports
- [x] Multiple win conditions — scripts define custom victory conditions beyond "reach escape room"
- [x] NPC system — non-enemy characters with scripted dialogue trees. How can we also have NPCs in the roguelike campaigns? Should NPCs have inventory? Does the D&D 5e ruleset have an NPC specification?
- [ ] Campaign persistence — world state that survives across multiple sessions (separate from per-session GameState)

## Rules Engine (D&D 5e gaps)
- [x] Class features — Sneak Attack (Rogue/Pilot: ⌈level/2⌉d6 on hit with advantage or ally in combat; dice doubled on crit), Extra Attack (Warrior/Soldier level 5+: 2 attacks; level 11+: 3 attacks), Rage (Warrior: bonus action, +rage-damage-bonus on STR melee, halve incoming physical damage, uses tracked in class_resource_uses, restored on long rest, clears on combat end). Divine Smite and Bardic Inspiration deferred — require spell slot system.
- [x] Multiple attacks — Extra Attack at level 5 (2 attacks) and level 11 (3 attacks) via resolveOneAttack loop.
- [x] Saving throw proficiencies — classSavingThrows on Context (2 abilities per class); rollConditionSave adds profBonus when proficient.
- [x] Rules engine spec-conformance tests — anchored tests for profBonus exact values per level; attack roll formula; death save nat-1/nat-20 edge cases; advantage/disadvantage two-roll mechanics; new tests for sneakAttackDice, extraAttackCount, rageDamageBonus, rageUsesMax, rollConditionSave with/without proficiency.
- [x] Bonus action enforcement — turn_actions lifecycle (action_used, bonus_action_used); auto-advance fires only when no requiresBonusAction choices remain; end_turn action for explicit forfeiture.
- [x] Short rest / long rest — short rest spends a hit die (d{class-die} + CON mod) once per room; long rest restores full HP + clears conditions + recovers half-level hit dice + restores class resource uses (rage_uses etc.), once per session; both blocked while enemy is alive; room canRest flag lets campaign authors disable resting in specific rooms.
- [x] Hit dice — per-class die size in Context.classHitDie; hit_die and hit_dice_remaining on Character; displayed in stats bar; recovered on long rest (max(1, floor(level/2))).
- [ ] Spell system — spell slots (levels 1–9, recovery on long rest), spell attack rolls (8 + prof + spellcasting ability), spell save DCs, cantrips, concentration (CON save on damage to maintain). Prerequisite for Divine Smite and Bardic Inspiration.
- [ ] Full conditions list — missing: blinded (attacks have disadv, attackers have adv), charmed (can't attack charmer), exhaustion (6 levels, cumulative penalties), invisible (adv on attacks, disadv against), restrained (speed 0, disadv on attacks, adv against), incapacitated (no actions/reactions), grappled (speed 0), petrified
- [ ] Traps — core dungeon element entirely absent. Investigation/Perception to detect (vs trap DC), Thieves' Tools proficiency check to disarm, damage/condition on trigger. Defined in room data.
- [ ] Armor/weapon proficiency enforcement — currently any class can wear any armor with no penalty; heavy armor without proficiency should impose disadvantage on STR/DEX checks and prevent spellcasting
- [ ] Two-weapon fighting — bonus action attack with light off-hand weapon when wielding two light weapons; no ability mod to damage unless feat
- [ ] Grapple / Shove — contested Athletics checks: grapple sets target speed 0, shove knocks prone or pushes 5ft
- [ ] Ability Score Improvements — at levels 4, 8, 12, 16, 19: +2 to one stat or +1 to two. Currently leveling only adds max HP.
- [ ] Backgrounds — grant 2 skill proficiencies + 1 tool proficiency + a narrative feature; add to character creation
- [ ] Magic item attunement — max 3 attuned items per character; some items require attunement to function

## Party System
- [x] Initiative-based turn order — `buildInitiativeOrder` rolls d20+DEX for all participants; post-action loop auto-resolves consecutive enemy turns; `InitiativeStrip` UI shows turn sequence; conditions tick at turn start. Reactions deferred to class features milestone.
- [x] Party UI improvements — initiative strip, active-turn glow on character tab, condition badges, greyed-out "waiting" state, multi-target heal choices per injured party member. Reactions deferred to class features milestone.
- [ ] Enemy HP scaling by party size — multiply enemy HP by `0.5 + (partySize * 0.5)` at seed generation time (1× solo, 1.5× two-person, 2× three, 2.5× four); baked into Seed so difficulty is fixed for the run; pass `partySize` into `generateSeed`.
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
