# TODO

<!-- Sections without open items have been pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## Top 5 — completing the 5.5e engine [✓ ALL SHIPPED]

> Goal: full 2024 PHB / SRD 5.2.1 mechanics coverage. All 5 items below
> landed in commits `ed841a1..1dfca3f`. Combat resolution + class
> features + multi-target spells are now on the 2024 spec.

1. [x] **Weapon Masteries — all 9 + per-class slots** (`ed841a1`). Topple / Push / Sap / Slow were already in; Cleave / Graze / Flex / Nick added. Vex was implemented earlier. Per-class slot count via `SRD_WEAPON_MASTERY_SLOTS` (Fighter 3 / Barb-Pal-Rang 2 / Rog 1).
2. [x] **2024 class feature audit — Cleric / Fighter / Monk** (`d17f647` + `e36fb63`). Cleric: Divine Spark + Turn Undead (bonus action) + Sear Undead L5. Fighter: Second Wind multi-use (2/3/4 at L1/L4/L10). Monk: Patient Defense + free 1/turn Step of the Wind + Stunning Strike 1/turn cap + 2024 Martial Arts die progression (d6/d8/d10/d12).
3. [x] **Heroic Inspiration on any d20** (`db312c7`). `inspiration_pending` now applies to ability checks too (saves were already wired). `spend_inspiration` choice surfaces in + out of combat.
4. [x] **Hide action — full DC tracking** (`4d10043`). Successful Hide stores `hide_dc = stealth_total`. Enemies roll passive Perception (10 + WIS mod) vs `hide_dc` when targeting the hider; on detect, invisible is removed and DC cleared. Attacking also clears both.
5. [x] **Multi-target spell allocation** (`1dfca3f`). `cast_spell.targetEnemyIds?: string[]` carries one entry per dart/beam. Choice gen emits focus-fire + spread variants for Magic Missile (per slot) and Eldritch Blast (L5+). Each shot resolves independently (per-beam attack roll for EB, per-dart auto-hit for MM).

The 5.5e RAW gap list (relative to the 2024 PHB + SRD 5.2.1) is now down
to the small-impact items below.

---

## 5e SRD remaining gaps

> **Edition alignment** — Pansori targets 2024 PHB / SRD 5.2.1. Most of the lift is done: 2014→2024 migration shipped for Wild Shape (Beast Forms), Rage progression, Cunning Strike, and the reactive-spell window. Remaining 2024 work is captured in the Top 5 above (weapon masteries, class feature audit, inspiration spend rules) and the gameplay-impact items below.

### Real gameplay impact (worth doing)

- [x] **Heroic Inspiration (Nat-1 grant)** — auto-granted on a Nat-1 d20, spent via `spend_inspiration` for advantage on the *next attack*. Saves/ability-check spend is still missing (see top-5 #3).
- [x] **Reactive spells / interrupt system** — Shield, Hellish Rebuke, Counterspell all ship. `pending_reaction` discriminated union pauses `runEnemyTurns` and yields control to the eligible PC. Enemy spell-casting wired (Frost Acolyte casts fire_bolt @ 40% to exercise Counterspell).
- [x] **Subclass packs (all 12 classes)** — every class ships ≥1 subclass. Cleric (life, war), Fighter (champion, battle_master), Rogue (thief, assassin), Wizard (evoker, abjurer), Ranger (hunter, beastmaster), Paladin (devotion, vengeance), Bard (lore, valor), Sorcerer (draconic, wild_magic), Warlock (fiend, archfey), Druid (land, moon), Monk (open_hand, shadow), Barbarian (berserker, totem_warrior).
- [x] **Wild Shape — 2024 Beast Forms** — replaced the 2014 temp-HP-pool. Beast Forms catalog (`contexts/srd/beast_forms.ts`) with 6 forms; Druid keeps own stats + adds the form's attack/AC/speed profile (5aa954b).
- [x] **Rage — 2024 progression** — uses-per-rest table + 2024 damage scaling (97a22ad).
- [x] **Cunning Strike (2024 Rogue L5)** — trip / poison / withdraw / disarm options (9ebcac4).
- [x] **Reach weapon OA range** — `opportunityAttackTriggers` honours a 10-ft reach lookup; default 5 ft preserved.
- [x] **Weapon Masteries — all 9 + per-class slots** (`ed841a1`). Slot counts in `SRD_WEAPON_MASTERY_SLOTS`.
- [x] **Multi-target spell allocation** (`1dfca3f`). Magic Missile + Eldritch Blast focus-fire/spread choices.
- [x] **Hide action — full DC tracking** (`4d10043`).
- [x] **2024 class feature audit — Cleric / Fighter / Monk** (`d17f647`, `e36fb63`).
- [x] **Inspiration spend on any d20** (`db312c7`).
- [x] **Heavy-encumbrance disadvantage** (`850ee27`) — STR/DEX/CON checks + saves + attacks now see disadvantage when carried weight > 10×STR. `isHeavilyEncumbered` helper + `extraDisadvantage` param on `rollConditionSave`. Surfaced in attack narrative reasons.
- [x] **Bardic Inspiration spend on any d20** (`ed93a5b`). `consumeBardicForCheck(char)` helper wired into Sneak, Hide, and Search ability-check sites. Saves were already wired through `conditionSavingThrow`.
- [x] **Enemy Search action vs Hide DC** (`4fc3e55`). When passive Perception fails to spot a hidden PC, the enemy uses their action on an active d20 Search. Success = revealed + attack forfeited; failure = turn lost. Hide now genuinely denies attacks instead of just imposing disadvantage.
- [x] **Tactical Master + Studied Attacks (Fighter L9 / L13)** (`e83eb30`). Tactical Master pre-arms a Push/Sap/Slow mastery swap for the next attack via `turn_actions.tactical_master_mastery`. Studied Attacks marks missed targets with `studied_by_${char.id}` for next-attack advantage.
- [x] **2024 Species — full mechanical traits** (`22f9ad6..1c25de7`). 10 species in `contexts/srd/species.ts` (Human, Elf, Drow, Dwarf, Halfling, Gnome, Dragonborn, Tiefling, Goliath, Orc) with character-creation picker. Per-species traits wired: Human Resourceful/Skillful, Elf Keen Senses + Charmed-save advantage, Drow Charmed advantage, Dwarven Toughness HP scaling, Dwarf Poisoned advantage, Halfling Lucky (re-roll Nat 1 on attacks/checks) + Frightened advantage, Goliath Powerful Build (doubled STR for encumbrance) + Large Form (bonus action, +10 ft speed, 10 rounds), Dragonborn Breath Weapon (15-ft cone, scales with level, 1/short rest), Tiefling Infernal Legacy (Hellish Rebuke 1/long rest), Orc Relentless Endurance (drop-to-1 1/long rest) + Adrenaline Rush (bonus-action Dash + temp HP). Species damage-type resistances applied in `applyEnemyAttackNarrative`.
- [x] **Failed precondition actions preserve the turn** (`a0b0dfe`, `01897fb`). Out-of-range melee attack, out-of-range Sacred Flame, out-of-reach Grapple, and Cleric-in-heavy-armor cast all bail BEFORE the action/slot/concentration is consumed. Initiative stays on the player so they can pick a different action. Six regression tests gate against future drift.
- [x] **Enemy tactical movement + PC opportunity attacks** (`4063f88`). Enemies BFS-pathfind toward the nearest PC up to `Enemy.speedFt` (default 30 ft) and only attack when they reach `Enemy.attackReachFt` (default 5 ft; override to 10 ft for reach-weapon monsters). PCs whose threat zone is broken auto-OA via `resolvePlayerAttack`, consuming their reaction. Grappled/restrained enemies have effective speed 0 and forfeit the attack if out of reach. Spell-casting enemies still resolve through the existing cast branch (spell range is per-spell, not movement-gated).

### No-current-content (defer)

- [x] **Frightened — movement restriction** (SRD p.182) — implemented. `Character.condition_sources` tracks the entity that caused each condition (currently only used for `frightened`). Enemy on-hit effects that frighten a PC record the enemy id; the grid_move handler rejects moves that would close distance to that source. `inflictCondition` accepts an optional `sourceId`; `tickConditions` clears sources on expiry. Useful in Vale (Crypt Lord's frighten-on-hit) and any campaign with frighten-rider attacks.
- [x] **Heavy weapon disadvantage for Small species** (SRD p.90) — wired now that 2024 species ship. Halfling and Gnome (size: 'small') get disadvantage on attack rolls when wielding a Heavy weapon (greatsword/greataxe/longbow). Narrative surfaces "heavy weapon — Small creature" in the disadvantage reason chain.
- [x] **Charmed: charmer attribution** — `charmer_id` is set automatically when an enemy on-hit effect inflicts `charmed` (Fey Trickster path). Charmed PCs already can't attack their charmer (existing check at gameEngine.ts ~3277). Source-attribution shape mirrors the new `condition_sources` map for Frightened.
- [x] **Costly material component consumption** — `Spell.materialCost?: number` (gp) deducts from `char.gold` on cast; insufficient gold blocks the cast with "requires a N gp material component you don't have." No SRD spell currently sets the field, but the engine path is ready for spells that should consume one (Identify, Revivify, Resurrection, etc.).
- [ ] **Group ability checks** (SRD p.6) — half-the-party-succeeds = group succeeds. Could fold into the existing sneak action when a party rolls together.
- [ ] **Non-killer level-up gap** — `splitEncounterXp` correctly distributes XP among the party, but the per-kill level-up check (`if (char.xp >= char.level * 100)`) only runs at **2 of the 13** kill sites in `gameEngine.ts` (the main attack at ~4594 and the single-target spell at ~5916). The other 11 kill paths (Cleave secondary, Magic Missile per-dart, Eldritch Blast per-beam, Flurry of Blows, Frenzy attack, Divine Spark, animal-companion bite, two-weapon off-hand, Cunning Strike, Hellish Rebuke retaliation, etc.) only update `char.xp` and skip the level-up check. With even XP split, a non-killer PC can sit at e.g. `xp: 250 / level 1` until their next personal kill at one of those 2 sites. Fix: extract the inline level-up block into a helper, call it for every PC after `splitEncounterXp` at each kill site. ~30 min + tests.

### Architectural blockers

- [ ] **Climbing & Crawling movement cost** — needs a "movement mode" concept. Skip until verticality.
- [ ] **Jumping** — Long jump = STR ft, high jump = 3 + STR mod ft. Same verticality blocker.

---

## Content & playtest

- [x] **End-to-end Vale of Shadows playtest** — DONE at the validation-gate level. Coverage by layer: (a) all 3 quests in a single session — `src/backend/src/contexts/vale_of_shadows.spec.ts` drives takeAction through every quest step + final escape; (b) session resume — Playwright `session resume` test reloads mid-game and verifies state rehydrates; (c) faction price modifiers — wired into shop choice generation + 5 backend tests covering all rep tiers. Still loose-end: manual playtest of the polish layer (narrative variety, no-LLM mode UX), which is ongoing on prod.
- [x] **Campaign modules — 3 shipped** — Vale of Shadows (dungeon/heist), Whispering Pines (mountain pass/cult), Grove of Thorns (fey/Druid showcase). A 4th would broaden archetypes but isn't blocking.
- [x] **Boss fight phases** — HP-threshold phase transitions shipped (b330783). `EnemyTemplate.phases: BossPhase[]` with `set_multiattack`/`set_damage`/`set_to_hit`/`set_ac`/`set_on_hit_effect`/`add_resistance`/`heal` effects. Crypt Lord (50% rage, 25% phylactery-heal) and Frost Acolyte (60% ice armor, 30% frostbinding) wired up. Frontend renders `phase_transition` events.
- [ ] **Boss fight follow-ups** — legendary actions + lair actions (SRD p.221) are still separate systems we haven't tackled. Defer until a campaign needs them.
- [ ] **Fourth campaign module (opportunistic)** — coastal pirate town, desert ruin, planar city, etc. Stress-tests the format further. Not on the critical path.

---

## Combat UX (recently shipped)

- [x] **Movement D-pad** — 3×3 arrow grid (Phosphor icons) replaces the 8-row "Move N → (3,4) [25ft left]" text list during grid combat. Center cell shows remaining feet. Disabled cells for out-of-bounds / occupied neighbours so the layout stays a stable 3×3. Backend tags grid_move choices with `kind` + `direction` for the FE to place each arrow.
- [x] **Default-action icon bar** — Dash / Disengage / Dodge / Ready surface as a horizontal row of rpg-awesome icon buttons (boot-stomp / player-teleport / player-dodge / stopwatch) above the choice list. Backend tags each with `ChoiceKind`; FE icon row consumes them.
- [x] **rpg-awesome integration** — installed as a frontend dep, globally imported in `main.tsx`. Thin `<RaIcon name="...">` wrapper with optional aria-label / rotate. Credits added to README (SIL OFL 1.1 font + MIT CSS).
- [x] **Per-target spell picker** — single-target offensive spells (Guiding Bolt, Sacred Flame, Fire Bolt, Inflict Wounds, Hellish Rebuke, Ray of Frost, Toll the Dead, etc.) now emit one cast choice per living enemy with disambiguating `#N` suffix, mirroring the Attack-per-enemy pattern. RAW: spells say "a creature of your choice" — the engine was auto-aiming at `livingEnemies[0]` for everything but Magic Missile / Eldritch Blast. Magic Missile and Eldritch Blast L5+ keep their existing multi-target focus-fire/spread variants; AoE spells stay as a single origin (per-origin picker deferred).
- [x] **Enemy selector** — single-target picker above the choice list that says which enemy the next Attack / Cast / Grapple / Shove targets. Choices with `action.targetEnemyId` set are filtered to only the choice matching the selected enemy, collapsing the per-target variants into one visible button per action. Multi-target choices (Magic Missile spread, AoE) bypass the filter. Selector hides out of combat and re-anchors on the first living enemy when the roster changes.
- [x] **CombatActionBar** — Attack / Grapple / Shove / Two-Weapon as one rpg-awesome icon button each (crossed-swords / grappling-hook / sideswipe / dervish-swords). Pairs with EnemySelector — target-bearing combat verbs collapse to one icon per kind, target controlled by the selector. Backend tags each kind; FE filters them out of the text list so they don't double-render.
- [x] **SpellBar** — one icon button per single-target offensive spell at its lowest available slot, dedup'd by `spellId`. Per-spell rpg-awesome icon map (fire-symbol / sunbeams / burning-meteor / burning-eye / etc.) with `crystal-wand` fallback. Heal/utility, AoE, and multi-target variants (Magic Missile focus-fire / spread, Eldritch Blast multi-beam) stay in the text list — they have shapes the bar can't usefully collapse.
- [x] **ClassAbilityBar** — one button per available `use_class_feature` choice. 46 distinct featureIds covered (rage, second_wind, action_surge, divine_spark, turn_undead, cunning_action_*, flurry_of_blows, patient_defense_*, stunning_strike, channel divinity, bardic_inspiration, wild_shape dismiss, metamagic, fey_presence, vow_of_enmity, breath_weapon, large_form, command_companion, etc.) with sensible rpg-awesome glyphs. Prefix-matched groups for `wild_shape_*`, `tactical_master_*`, `metamagic_*`. Unmapped IDs fall back to `crystal-cluster`. Short-label extraction stops at first ` — ` or ` (` so multi-clause names like "Cunning Action: Disengage" survive.

## Bug fixes (recently shipped)

- [x] **Death-save soft-lock when a PC dies on their own turn** — when a player's death save rolled the 3rd failure (killing the PC), the early-return at `gameEngine.ts:3656` returned `choices: []` AND left `active_character_id` pointing at the now-dead PC. Next `generateChoices` saw `char.dead === true` and returned `[]`, freezing the UI on `[Fighter] An eerie silence...` with no buttons. Fix: when `died=true` and there are still living party members, advance `active_character_id` to the first living PC and regenerate choices before returning. TPK (allDead) still returns `choices: []` to surface the game-over screen.
- [x] **In-combat active_character_id round-robin bug** — `gameEngine.ts:8884` ELSE branch used to round-robin `active_character_id` whenever an action didn't consume initiative, *even when combat was active*. With grid combat (Vale / Pines / Grove), every PC starts each turn with movement available → `usedInitiative` stays false after a non-killing attack → the buggy ELSE silently shifts active forward while `initiative_idx` correctly stays put. PartyRail's `aria-current` and InitiativeStrip's `▶` would disagree mid-turn, the choice list would generate for the *next* PC, and play felt like turns were "jumping around" for no reason. Fix: tighten the ELSE to `!st.combat_active` only. Existing 2-char attack test (which was codifying the bug) renamed + assertion flipped to the correct RAW behavior; new regression spec pins the strip↔PartyRail invariant in grid combat.
- [x] **`{name}` placeholder leaking through deathLines narratives** — `processDeathSave` substituted `{enemy}` and `{world}` but not `{name}`, so Vale's `'{name} falls, life fading...'` template rendered verbatim. The placeholder-lint also tightened from "any `.replace(...{token}...)` somewhere in the file" to a per-pool, per-reference strict check (with a file-wide loose fallback for variable-indirected pools) so this class can't recur silently.
- [x] **XP distribution split among living party** — every kill site (16 originally) now goes through `splitEncounterXp(st, killerId, totalXp)` that divides XP equally among non-dead party members (downed PCs still get a share — only `dead: true` excludes). Solo parties: 100% to the only PC (no behavior change). Multi-PC parties: per-RAW even split. Killer's local `char.xp` mutation pattern preserved so existing level-up inline blocks still trigger; non-killer level-ups remain a known gap (only fires at 2 of 13 kill paths) — see "Non-killer level-up gap" below.

## Test coverage (recently shipped)

- [x] **Grid-combat invariants** — closed the unit-coverage gap that let the in-combat round-robin bug hide for the entire grid-combat era. New `makeGridCombatState` helper builds a real grid state (entities + non-zero grid dims + `movement_used`) and three specs pin: (a) `grid_move` doesn't shift the active marker; (b) `initiative_idx` and `active_character_id` stay aligned through `end_turn`; (c) multiple `grid_move`s in a row keep active locked to the same PC and burn movement correctly. Future engine work on the initiative path will trip these tests instead of shipping silently.
- [x] **Multi-PC e2e invariants** — Vale combat test asserts the InitiativeStrip's ▶ marker stays in sync with PartyRail's `aria-current` per turn, full roster of 5 entries (3 PCs + 2 bandits), and class-button separation invariant (`cast_spell` appears for Cleric only, gated on action availability).
- [x] **deathLines regression spec** — `gameEngine.spec.ts:7489` exercises the `case 'dead'` path, asserts the character name lands in the narrative and `{name}` doesn't leak through. The placeholder lint is the structural gate; this spec is the runtime gate.
- [x] **Encounter XP distribution specs** — 5 tests covering solo vs multi-PC split, dead PC excluded, downed PC included, kill-event payload reports share.
- [x] **Speaker-prefix specs** — 3 tests covering multi-PC attack narrative gets `[CharName]` prefix regardless of opener, solo PC doesn't, and prefix suppression when prose already names the active PC.
- [x] **Per-target spell picker specs** — 2 tests asserting 2-enemy room emits 2 Guiding Bolt choices each with distinct `targetEnemyId`; 1-enemy room emits exactly 1.
- [x] **Default-action / combat-action tagging specs** — assert Dash / Disengage / Dodge / Ready surface with `kind` in combat; Attack / Grapple / Shove emit per-target with `kind` set.

## Type-share infrastructure (recently shipped)

- [x] **Single source of truth for cross-cutting types** — `src/shared/types.ts` is the authoritative declaration for **34 cross-cutting types** across phases 1 and 2:
  - **Phase 1 atoms + choice / event types**: AbilityKey, WeaponMastery, ConditionName, NpcAttitude, CoverLevel, LocationType, QuestStatus, GridPos, CombatEntity, StructuredAction, ChoiceKind, ChoiceDirection, GameChoice, CombatEvent, COMBAT_LOG_MAX.
  - **Phase 2 (added later in the same session)**: GameConsequence, RoomObject, NpcShopEntry, NpcDialogueResponse, NpcTemplate, PlacedNpc, District, Background, QuestStep, FactionThresholds, Quest, QuestProgress, Faction, CampaignState, LootItem, PendingReactionBase, PendingShieldReaction, PendingHellishRebukeReaction, PendingCounterspellReaction, PendingReaction.

  Sync script (`scripts/sync-shared-types.ts`) copies the source into each workspace as `shared-types.ts` with an AUTO-GENERATED header. Both `src/backend/src/types.ts` and `src/frontend/src/types.ts` `export * from './shared-types.js'` + explicit type-only imports for in-file references. CI gate: `npm run sync-types:check` exits 1 on drift. `prebuild`/`predev`/`pretest` hooks ensure dev/test/build paths can't run with stale copies.

  **Real type bugs surfaced during phase 2 (and fixed)**:
  - `Background.toolProficiency` was declared `: string | null` (required) but most context backgrounds (Outlander, Soldier) omitted it. Made optional.
  - `FactionThresholds` was missing the `exalted: number` 5th-tier field that both `grove_of_thorns.ts:844` and `CampaignPanel.tsx:19` were using. Added it.

- [ ] **Phase 3 of type-share** (remaining workspace-local: Character, GameState, Seed, Trap, Room, OnHitEffect, BossPhase, EnemyTemplate, Enemy, Spell, BeastForm, InventoryItem, TurnActions, DeathSaves, Context/FrontendContext, Location, GameRule, RuleFacts, CampaignFacts) — these either depend on BE-only types that would cascade-share (Seed → Enemy → BossPhase → OnHitEffect; Location → Room → Trap), have FE-vs-BE structural differences requiring reconciliation (Character / GameState — FE has slim versions, BE has rich), or are intentionally separate (FrontendContext vs Context). Defer until there's a concrete reason to share each one.

## UX & polish

- [x] **3-zone UI redesign + a11y baseline** — PartyRail (left) + narrative/choices (center) + tabbed ContextPanel (right). Dialog primitive with focus trap + ARIA; live regions on narrative + combat log; landmarks; heading hierarchy; focus-visible; theme contrast bumped to ≥4.5:1. Four commits (`9230516..0f6f52c`).
- [x] **Combat narrative clarity foundation** — `CombatEvent` + CombatLogPanel ship; condition + save events for Abjure Enemy, Fey Presence, Goading Attack; `phase_transition` event for boss phases. Visual polish (event grouping, color theming) deferred until a playtest tells us it's needed.
- [~] **Grid map detail pass** — dead bodies render as faded 💀; same-name enemies get `#N` disambiguation; AoE preview tints when hovering a spell choice; cells carry rich `aria-label`. Still TODO: difficult-terrain squares (rocks/snow tile), obstacles, party LoS indicators, last-attacker arrows.
- [x] **Narrative speaker clarity** — `gameEngine.ts:8911` prepends `[CharName] ` to every multi-PC narrative unless the prose already opens with the active char's name. The check uses `narrative.startsWith(`${char.name} `) || `${char.name}:` || `[${char.name}]`` (not the old `/^You\b/` regex, which missed third-person openers like "A solid strike lands on..." and even "Your attack..."). Three regression specs in `gameEngine.spec.ts` lock the invariant for solo vs multi-PC, third-person openers, and the already-named suppression branch. Mid-line ambiguity in stitched narratives is now structurally addressed via the `{{kind|display}}` token format (see below).
- [x] **Placeholder lint** — `narrativePlaceholders.spec.ts` walks every `context.narratives` string for `{X}` tokens and confirms a matching `.replace(...)` exists.
- [x] **Narrative template format** — mechanical bits flow inline as `{{kind|display}}` tokens (`dmg`, `hp`, `roll`, `dc`, `ac`, `save`, `note`) emitted by `services/narrativeFmt.ts` and rendered as distinct monospace pills by `<NarrativeText>` (FE). Converted sites: player attack damage + to-hit breakdown (`atkNote`), enemy attack damage (`applyEnemyAttackNarrative`), opportunity attacks, enemy spell-cast outcomes (incl. save vs DC), death saves, healing item use, Relentless Endurance, Cleave, "HP remaining" lines. LLM enhance strips tokens to plain text (NoneProvider passthrough restores them so default mode still styles). Remaining narrative producers can adopt the helpers opportunistically — the format is now the convention.
- [ ] **Tutorial / onboarding** — 2-room intro covering the action choice loop, grid combat, inventory modal. New players have nowhere to learn the controls today.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat sound cues.
- [ ] **LLM narrative quality audit** — `llmProvider` enhances narratives; quality has not been systematically reviewed against the engine's mechanical output.

---

## Engine & infrastructure

- [x] **Authoring documentation (`AUTHORING.md`)** — shipped (b2705fc). Covers the campaign context format end-to-end.
- [ ] **Save/state persistence across redeploys** — verify a mid-campaign session survives a backend redeploy. The state migration path on schema changes is untested.
- [ ] **Difficulty tuning from playtest data** — once playtests happen, capture damage/HP/encounter telemetry to inform tuning passes.
- [ ] **gameEngine.ts class refactor (deferred)** — `takeAction` is ~3700 lines with three handlers that dominate (`use_class_feature` ~800, `cast_spell` ~544, `attack` ~532). Refactor into an `ActionContext` class that dispatches to handler files (`services/actions/castSpell.ts`, etc.). Moderate regression risk. Triggers to revisit: (a) big-handler edits grind into context budget; (b) a feature touches multiple handlers; (c) a quiet maintenance day.
- [ ] **Pre-commit hook (Husky + lint-staged)** — auto-run eslint + prettier on staged files before commit. Catches the class of bug where prettier-dirty code reaches CI and fails the build. ~30 min setup; bypassable with `--no-verify`. CI lint stays as the gate.

- [ ] **Multiplayer + party chat (online co-op)** — let friends share a session and chat in realtime. Architecture audit confirmed the base is close: `state.characters[]` already models a party, `state.current_room` is single-valued (no party split → players share one narrative), and the reactive-spell pause already routes prompts to the eligible PC. Four concrete gaps:
  1. **Ownership model**: `game_sessions.user_id` is single-tenant. Add `session_participants(session_id, user_id, character_id, role)`; authorization becomes "user is a participant." Original `user_id` stays as host (matters for delete/invite). ~3-4h.
  2. **Turn enforcement at the API boundary**: `takeAction` doesn't check `req.user.id === characters[active].owner_user_id`. Singleplayer doesn't care; multiplayer is exploitable. Add `Character.owner_user_id` + a single route-level guard. ~1h.
  3. **Realtime push (Socket.IO)**: one server room per session; `state` event after every takeAction broadcasts to all participants; `chat` event in both directions for messages. Keeps REST for writes (auth model unchanged, easy to reason about) and uses WS only for fanout. Needs sticky sessions if Pansori ever scales to >1 backend instance — today single EC2, no concern. ~7h server + frontend integration.
  4. **Chat MVP**: input + message list + `chat_messages` table for persistence. ~3h.
  5. **Race detection** (optional): `turn_seq` column rejects stale takeAction submissions when two players race-click. ~1-2h. Defer until it actually bites.

  Total ~15-17h, splittable into 4 PRs. Order: participants table → Socket.IO scaffolding → chat → race detection. Each PR keeps singleplayer working; multiplayer only activates when a session has >1 participant.

  Open questions to settle before starting:
  - Invite UX: shareable link, or invite-by-email through users table?
  - DM mode (one player runs encounters for others) or strict party-of-equals?
  - Voice — pipe Discord OAuth into a Discord-server-link feature, or leave voice out and let players use their own VC?

- [x] **Playwright E2E test** — four tests in `tests/e2e/vale-smoke.spec.ts`: (a) Vale smoke covers login → BEGIN MISSION → narrative renders → 3-PC party + class labels + initiative-strip-hidden-in-town + active-PC round-robin after `examine`; (b) session resume reloads mid-session and verifies state rehydrates; (c) sandbox combat drives the choice loop until an Attack action surfaces; (d) Vale combat verifies multi-PC initiative goes live with full roster (3 PCs + 2 bandits), the InitiativeStrip's ▶ marker stays in sync with the PartyRail's `aria-current` per turn, and the cast_spell choice respects class membership (Fighter/Rogue never see it; Cleric does when their action is fresh). `data-testid` on key UI elements (now including `initiative-strip`) + `data-action-type` on choice buttons. Auth bypass `/api/auth/test-login` double-gated. Combat test has `retries: 2` for procgen variance. Wired into CI: `e2e` job in `.github/workflows/deploy.yml` runs after the unit-test job and gates `build-and-deploy`. Failure uploads `playwright-report/` + `test-results/` as artifacts and dumps backend/frontend/postgres compose logs.

- [x] **Direct unit coverage for grid-combat invariants** — shipped. `makeGridCombatState` helper + 3 specs landed in `gameEngine.spec.ts` under `describe('grid-combat invariants', ...)`. See "Test coverage (recently shipped)" above for the per-spec breakdown. The broader follow-ups originally noted here ((b) monotonic advancement through full rounds, (c) strip↔PartyRail sync preserved through reactive-spell pauses) are still worth doing — leave a softer TODO entry for those:
- [ ] **Grid-combat invariants — full coverage follow-up** — extend the `makeGridCombatState` fixture with specs for: (a) `initiative_idx` advances monotonically across a full round and wraps cleanly at the end; (b) the strip↔PartyRail sync invariant is preserved through reactive-spell pauses (Shield / Counterspell / Hellish Rebuke — the `pending_reaction` path mutates `active_character_id` to the reactor and back, which the e2e doesn't exercise). The phase-1 specs cover the common path; these would pin the edge cases.

### Architecture audit findings (2026-05-19; revisited 2026-05-20)

Captured during the autonomous-mode audit. Items marked **autonomous** can be picked up without user input; **needs-input** requires a design call. Most autonomous items have since landed — the remaining open list is shorter than when the audit was first captured.

- [x] **Body validation gaps** — Zod schemas now gate every POST body that takes JSON: `/api/auth/test-login`, `/api/game/session/new`, `/equip`, `/transfer`, `/drop`, `/action`. Schemas live in `src/backend/src/routes/schemas.ts`; failures return `{ error, issues: [{path, message}] }` with 400. `StructuredAction` is intentionally loose-typed at the route boundary (the engine's exhaustive switch covers depth).
- [x] **Security headers** — `helmet({ contentSecurityPolicy: false })` middleware added to `src/backend/src/index.ts` (4bf73c1).
- [x] **Frontend error boundary** — top-level `<ErrorBoundary>` wraps `<App>` in `src/frontend/src/main.tsx` with a recovery UI (4bf73c1).
- [x] **Strongly-typed req.user** — all 10 sites in `routes/game.ts` now go through `authedUserId(req)` which casts to `AuthedRequest` (was already declared in `auth/middleware.ts`, just unused). No more `!` non-null assertions in the routes.
- [x] **Update .env.example** — already current: Discord OAuth fields + `E2E_TEST_LOGIN_ENABLED` documented in `.env.example`.
- [x] **Rate-limit auth endpoints** — `express-rate-limit` middleware on `/api/auth/*` caps at 30 req/min/IP. `RateLimit-Policy` + `RateLimit` headers exposed to clients (draft-7 spec). Confirmed via curl on `/api/auth/google`.
- [x] **Fix react-hooks/exhaustive-deps warnings** — both stale-closure-risk warnings cleared. The mount-only init effect (auth + resume-from-URL) keeps `[]` deps with an `eslint-disable-next-line` and a comment explaining why (re-running on identity change would re-fetch the user and race with in-flight resume). The keystroke listener now lists `handleChoice` in deps so it sees fresh `history` from useGame; re-registration on each render is one cheap DOM op. The `react-refresh/only-export-components` warning on App.tsx was also cleared by extracting `applyTheme` to `src/frontend/src/lib/theme.ts`. Lint currently shows only one pre-existing `no-console` warning in `useGame.ts`.
- [x] **Root-level `npm test`** — already wired: `package.json` `test` script runs `test:be && test:fe` (vitest in each workspace).
- [ ] **Socket.IO frontend client** (needs-input) — the server-side Socket.IO scaffolding already exists in `src/backend/src/index.ts` (room-join handler + per-session rooms), but no frontend client is wired and no state broadcasts happen. The Multiplayer TODO under-estimated this — half of the WebSocket scaffolding is already done. Open question: do we wire the client now (as prep for multiplayer) or wait until the participants-table item lands?
- [~] **Frontend↔backend type drift** — phases 1 and 2 shipped: `src/shared/types.ts` is the single source of truth for **34 cross-cutting types**, including the drift-prone discriminated unions (StructuredAction / ChoiceKind / GameChoice / CombatEvent) and the campaign/quest/faction interfaces. Sync script + `prebuild`/`predev`/`pretest` hooks; CI gate via `npm run sync-types:check`. Phase 2 also surfaced + fixed two real type bugs (Background.toolProficiency made optional; FactionThresholds.exalted added). Phase 3 (Character / GameState / Seed / Trap / Room / Enemy / etc.) still deferred — see "Type-share infrastructure" above for what's left and why.
- [ ] **Observability** (needs-input) — only `console.log` today. Sentry / structured logging / error tracking would surface prod issues. Requires choosing a service (paid SaaS or self-hosted).
- [x] **`npm audit` clean across all three workspaces** — root, backend, frontend all return `found 0 vulnerabilities`. Two fixes: (a) `ws ^8.20.1` override at root + backend addresses the socket.io transitive uninitialized-memory disclosure (GHSA-58qx-3vcg-4xpx); (b) vite bumped to ^7.3.3 + `esbuild ^0.25.0` override resolves the dev-server SSRF (GHSA-67mh-4wv8-2f99). Per-workspace lockfiles regenerated so Docker `npm install` lands on the patched versions.
- [ ] **CHANGELOG.md** (needs-input) — no user-visible change log. Should we keep one? Format (Keep-a-Changelog, conventional commits, etc.)?
- [ ] **Post-deploy health check + rollback** (needs-input) — CI deploys via SSM but doesn't poll `/api/health` after to verify, nor roll back on failure. Bad deploys 500 prod until manual intervention. ~2-3h to wire properly.

---

## Deployment reference

Already shipped: ECR, EC2, RDS, ALB-less direct EC2 + nginx, Let's Encrypt with certbot webroot auto-renew, GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker Compose prod. The required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
