# TODO

<!-- Completed items pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## 5e SRD remaining gaps

> **Edition alignment** — Pansori targets 2024 PHB / SRD 5.2.1. The Top 5
> (weapon masteries, class feature audit, inspiration spend, Hide DC,
> multi-target spells) and the bulk of subsystems are shipped; remaining
> RAW gaps are small-impact or architecturally blocked.

### Mechanics-completeness roadmap (2026-05-21)

> Engine + mechanics first; content (more spells, more monsters,
> more class feature data) is data-entry work once the framework
> exists. Items below are ordered roughly by leverage — Tier 1
> unlocks the most downstream features per unit of code.

#### Tier 1: schema + registry gaps (blocks rule expression)

- [~] **Feats system** (Tier 1A — shipped 2026-05-21 as foundation;
      runtime hooks pending). New `Feat` type + `FeatEffect`
      discriminated union in `shared/types.ts`. `featTable?:
      Record<string, Feat>` on `Context`. `services/feats.ts` with
      `canTakeFeat` (prereq check) + `applyFeatTake` (per-effect
      take-time grants). `take_feat` action handler in `meta.ts`;
      consumes `asi_pending` for `general`-category feats (not for
      `origin` from background). `Character.feat_choices` records
      half-feat / save-proficiency picks. 3 seed feats: Tough
      (`hp-per-level`), Lucky (`d20-reroll` resource), Sharpshooter
      (`ranged-toggle`). Wired into all 4 contexts (sandbox, vale,
      grove, whispering). 11 direct tests.

  **Remaining (data + runtime hooks):**
  - [~] Lucky's spend hook (2026-05-22, attack-only MVP). New
    `use_luck` action mirrors `spend_inspiration`'s shape — sets
    `turn_actions.luck_pending`, decrements `feat_lucky_uses`. Hook
    in `attack/toHit.ts` consumes the flag as an advantage source.
    `resetFeatLongRestResources` in `services/feats.ts` refills the
    pool on long rest. **Remaining:** save + ability-check hooks
    (each calling site has to thread `luck_pending → advantage`
    through `skillCheck` / `rollConditionSave`). RAW spend-after-
    roll timing also deferred (current MVP is spend-before-roll for
    simplicity).
  - [x] Sharpshooter toggle (2026-05-22). New `toggle_sharpshooter`
    action flips `turn_actions.sharpshooter_active` (free of action
    economy; auto-clears at turn end via FRESH_TURN). In `toHit.ts`:
    -5 penalty folded into `totalAttackBonus`, cover suppression
    (half + three-quarters → 0), gates on `weaponItem.range ===
    'ranged'`. In `attack/index.ts`: +10 damage rider rolled into
    `rawDmg` so resistance/vulnerability multiplier applies; bonus
    surfaces on the hit narrative. 5 direct tests. Long-range no-
    disadv is a no-op until ranged long-range disadv is enforced
    (not in pansori today).
  - Magic Initiate's spell-grant flow (FE chooser + add to
    `spells_known` + per-rest L1 cast tracking).
  - More feats: Resilient (half-feat with `save-proficiency`),
    Mobile, Sentinel, War Caster, Polearm Master, Great Weapon
    Master, Heavy Armor Master, Crossbow Expert, Tavern Brawler,
    Magic Initiate (data). Each is ~30 lines of data once the
    matching effect kind exists; new shapes need one new union
    variant.
  - ASI-vs-feat UX on the FE (both `apply_asi` and `take_feat`
    actions are available when `asi_pending` is set; FE picks the
    surfacing).
- [ ] **Multiclassing.** `Character.character_class: string` is a
      single string; PHB multiclass spell-slot table is commented
      in `rulesEngine.ts:650` but only computes single-class slots.
      Needs schema change to `class_levels: Record<string, number>`,
      prerequisite check (ability score min), combined spell slot
      calc, feature gating by per-class level, saving-throw profs
      from first class only, level-up UX for class choice.
- [x] **Backgrounds with behavioral effects** (shipped 2026-05-21).
      `Background` type extended in `shared/types.ts` with 2024 PHB
      fields: `originFeat`, `abilityScoreIncreases`, `startingEquipment`,
      `language`. Character creation in `routes/game.ts` auto-applies
      `originFeat` via `applyFeatTake` after the base character is
      built. New `services/backgrounds.ts` exposes `getBackground` +
      `backgroundGrants` for FE display. Sandbox seed backgrounds
      (Soldier / Criminal / Sage / Acolyte) populated with the new
      fields; canonical origin feats stub on Tough / Lucky until
      Magic Initiate / Alert / etc. ship. 4 direct tests.

  **Remaining (data + flows):**
  - `startingEquipment` application path — currently informational;
    needs to merge with `classStartingLoot` and the auto-equip
    flow in character creation.
  - PHB origin feats not yet seeded: Alert, Crafter, Healer,
    Magic Initiate (3 variants), Musician, Savage Attacker, Skilled,
    Tavern Brawler. Each is data once the matching feat shape
    exists.
  - Backgrounds in non-sandbox contexts (Vale, Grove, Whispering)
    still use the legacy minimal shape; can be enriched any time
    without breaking existing characters.
- [~] **Magic item attunement** (mostly shipped — 2026-05-21).
      Pre-existing: `handleAttune` enforces 3-max + out-of-combat
      gate, equip flow in routes/game.ts gates attunement-required
      items behind `attuned_items`. **New this PR:**
      - `cursed` + `curseDesc` fields on `LootItem` (synced via
        shared types).
      - Curse reveal in `handleAttune` — narrative appends the
        curse text when an item with `cursed: true` is attuned.
      - New `de_attune` action + `handleDeAttune` for voluntary
        unbinding. Cursed items refuse de-attunement (require
        Remove Curse, not yet implemented). De-attuning an
        equipped attunement-required item implicitly unequips it.
      - 6 direct tests covering all branches (cursed reveal,
        un-cursed de-attune, cursed-refuse, implicit unequip,
        combat-rejected, not-attuned-rejected).

  **Remaining:** Short-rest gating per RAW ("spend a short rest
  attuning"), Remove Curse spell + interaction with `de_attune`,
  cursed magic items in seed loot tables (currently no test
  context has cursed items beyond the spec fixtures).

#### Tier 2: 2024 PHB actions + reactions (combat completeness)

- [x] **Influence action** (shipped 2026-05-21). Distinct from
      pre-existing `talk` / `talk_response` (which stay free
      narrative). New `influence` action: CHA + skill check
      (persuasion / deception / intimidation) vs `max(15, target INT)`.
      In combat: consumes the Action (`usedInitiative = true`).
      Outcomes: enemy-target success removes enemy from fight (no
      XP, narrative yields); NPC-target success shifts attitude
      one step friendlier. 5 direct tests.
- [x] **Study action** (shipped 2026-05-21). Distinct from
      `examine` (which is a sensory-description action with no
      check). New `study` action: INT + skill (arcana / history /
      investigation / nature / religion) vs `15 + ⌊CR⌋`. Creature
      analysis success reveals vulnerabilities / resistances /
      immunities / condition_immunities. In combat: consumes the
      Action. Object analysis + free-form lore-recall branches are
      TODO (the type accepts `loreTopic` for future use). 4 direct
      tests.
- [ ] **Magic / Utilize action-category tags** — deferred. The
      2024 PHB Magic and Utilize aren't new player-facing actions:
      they're category wrappers around things Pansori already does
      (cast_spell + magic-item-use + magical class features =
      Magic; mundane item-use + interact_object = Utilize). The
      only mechanic that needs the categorization is Action Surge's
      "extra action, except the Magic action" rule — and that only
      matters once multiclassing lets a Fighter take Cleric levels.
      Best done in the same PR as multiclass. Mapping documented
      here so the future PR has the table:
      - `cast_spell` → Magic
      - `use` on magic item → Magic
      - `use_class_feature` for Channel Divinity / Wild Shape / similar → Magic
      - `use` on mundane item → Utilize
      - `interact_object` → Utilize
- [x] **Uncanny Dodge reaction** (Rogue L5 — shipped 2026-05-21).
      New `PendingUncannyDodgeReaction` variant in the shared
      PendingReaction union; mirrors Shield's proposed-snapshot
      stash pattern. `isUncannyDodgeEligible` helper in
      `gameEngine.ts` gates on: Rogue class, L5+, reaction
      available, conscious, not blinded. Wired into
      `runEnemyMultiattackLoop` between the Shield-eligibility
      check and the commit path. `reaction.ts` resolver handles
      accept (halves damage by adding back half to proposed char
      hp, consumes reaction, emits half-damage event) and decline
      (commits full proposed snapshot with a "(Uncanny Dodge
      declined.)" suffix). 2 direct tests.
- [~] **Absorb Elements reaction spell** (MVP shipped 2026-05-21).
      New `PendingAbsorbElementsReaction` variant. Detection in
      `runEnemyMultiattackLoop` fires when the enemy attack deals
      acid/cold/fire/lightning/thunder AND the PC has the spell
      with an available L1+ slot. Resolver: accept-with-slot
      halves the trigger damage + consumes lowest L1+ slot; accept-
      no-slot falls through to full damage; decline commits the
      full-damage snapshot. Spell data added to `srd/spells.ts`.
      3 direct tests covering all three resolver branches.

  **Remaining (post-MVP enhancements per RAW):**
  - Grant resistance to the triggering damage type until the start
    of the caster's next turn (subsequent same-type damage that
    round also halved). Needs an active-buff condition like
    `absorbing_<type>` with auto-clear on turn start.
  - Bonus +1d6 damage of the triggering type on the caster's next
    melee weapon attack. Needs a `pending_bonus_damage` field on
    the character + attack-handler hook.
- [x] **Smite mechanics** (shipped 2026-05-21). Note: the original
      "Smite reactions" framing was inaccurate — in 2024 PHB,
      Divine Smite is a **bonus-action spell** that pre-buffs the
      next weapon hit, and Improved Divine Smite is a **passive
      damage rider**. Neither is a reaction. The Vengeance subclass
      has bonus-action features (Vow of Enmity, already wired) but
      no "smite reaction" exists per RAW.

  **Divine Smite (spell):** cast time changed to `bonusAction`.
  New `Character.divine_smite_dice` field stashes pending d8s; the
  cast handler in `castSpell.ts` sets it to `2 + (slotLevel - 1)`
  and consumes the slot. The attack handler's hit branch reads +
  clears the field, rolls `Nd8` radiant (or `2N d8` on crit), and
  adds it as a `hitBonuses[]` entry. Allowed for weapon attacks
  and Monk unarmed strikes (matches PHB "Weapon or Unarmed Strike").

  **Improved Divine Smite (L11 Paladin):** always-on +1d8 radiant
  on every **melee-weapon** hit (ranged excluded per RAW). Crit
  doubles. Stacks with the spell.

  Both riders add their damage on top of `applyDamageMultiplier`
  output, so weapon-type resistance doesn't reduce them. TODO:
  separate multiplier check for radiant (the few radiant-resistant
  creatures in MM would currently take full smite damage).
  6 direct tests.
- [~] **Silvery Barbs reaction spell** (MVP shipped 2026-05-21).
      New `PendingSilveryBarbsReaction` variant. `computeEnemyAttack`
      now preserves the raw `atkD20` alongside `atkTotal` so the
      resolver can reroll meaningfully. Detection fires on any
      enemy hit when the PC has the spell + L1+ slot. Resolver
      rerolls a new d20, takes `min(originalD20, newD20)`, recomputes
      total, and re-evaluates vs `targetAc`: if it becomes a miss,
      damage is discarded and an `attack_miss` event is pushed;
      otherwise the hit stands. Slot + reaction consumed regardless.
      Spell data added to `srd/spells.ts`. 4 direct tests (lower-d20
      miss, higher-d20 hit-stands, no-slot fallback, decline).

  **Remaining (post-MVP):**
  - "Ally gets advantage on next d20" follow-up — needs a
    transient buff on the chosen ally tied to their next attack /
    save / ability check (1 minute or first-use cancel).
  - Party-wide eligibility — RAW any caster within 60 ft of the
    triggering creature can react; current MVP is target-only.
    `eligibleCharIds` already supports a list; the detection
    just needs to populate all qualifying PCs.
- [~] **Sentinel feat — protect-ally reaction** (shipped 2026-05-21).
      New `PendingSentinelReaction` variant. `findSentinelEligiblePcs`
      helper does party-wide eligibility (PCs other than the target,
      within 5 ft of target, has the Sentinel feat, reaction
      available, not blinded). Detection fires AFTER an enemy
      attack commits — pauses the multiattack loop. Resolver in
      `reaction.ts`: accept = the Sentinel PC makes a melee weapon
      attack against the attacker (full `resolvePlayerAttack` —
      d20 + STR/DEX + prof, vs enemy AC, damage on hit). Declines
      pass through with no resource spent. 3 direct tests.

  **Followup convention surfaced:** `pending_reaction.targetCharId`
  is the *reactor* (matches the validator check
  `ctx.char.id === rx.targetCharId`), not the original attack
  target. Sentinel was the first cross-actor reaction in Pansori;
  Counterspell already followed this convention. Documented inline
  in the multiattack-loop detection.

  **Remaining (deferred):**
  - Sentinel's second benefit (OA speed-zero on hit) — pansori's
    enemy movement is one-step-per-turn, so "speed 0 for the rest
    of the turn" rarely matters. Skip until multi-step enemy
    movement lands.

- [x] **Cutting Words** (Lore Bard) — already implemented; verified
      during the 2026-05-21 audit. Uses Bardic Inspiration as a
      reaction to penalize an enemy's attack roll, ability check,
      or damage roll.

#### Tier 3: rule-edge mechanics

- [ ] **Spell components.** Partial — has deafened-blocks-verbal +
      armor-prof-for-casting, but no systematic V/S/M flag
      enforcement per spell, no spellcasting-focus rule, no
      costly-material-component consumption.
- [ ] **Ritual casting** — cast without slot, +10 minutes. 0%
      implemented.
- [ ] **Long rest 2024 limits** — once per 24h; 8h with 6h sleep +
      2h light activity; interruption rules.
- [ ] **Lighting tracking** — bright/dim/dark. Affects perception,
      darkvision, hide. Likely 0%.
- [ ] **Difficult terrain** — costs 2× movement. Status unknown.
- [x] **Falling damage** (shipped 2026-05-21). New
      `applyFallingDamage(char, distanceFt, st)` in `damage.ts`.
      Rolls 1d6 bludgeoning per 10 ft fallen (capped at 20d6 = 200 ft
      terminal velocity). Routes through `applyDamage` so temp_hp /
      exhaustion clamp / concentration check all fire. Applies
      `prone` on survive; skipped on knockout / kill (a dying
      character is already prone-equivalent). Sub-10ft is a no-op.
      No caller in current pansori — exists for future content
      (Misty Step into open air, Levitate dispel, knockback off
      ledges). 4 direct tests.
- [ ] **Initiative ties** — resolution rule (DM decides; monster
      after PC on tie).

#### Tier 4: out-of-combat systems (lowest urgency)

- [ ] **Downtime activities** — work, training, crafting.
- [ ] **Bastions** (2024 PHB property system).
- [ ] **Crafting** — potions, scrolls, magic items.
- [ ] **Mounted combat.**
- [ ] **Vehicles.**
- [ ] **Movement modes** — climb / swim / jump / fly speed handling
      (also blocks the Climbing/Crawling/Jumping items below).

### Architectural blockers

- [ ] **Climbing & Crawling movement cost** — needs a "movement mode" concept. Skip until verticality.
- [ ] **Jumping** — Long jump = STR ft, high jump = 3 + STR mod ft. Same verticality blocker.

---

## Content & playtest

- [ ] **Boss legendary + lair actions — wire to actual bosses** — engine scaffolding (`EnemyTemplate.legendary_actions` + per-round point pool refreshing on the legendary's own turn; `EnemyTemplate.lair_actions` firing on round-wrap as AoE save-for-half damage) is in place with test coverage. Effects shipped: `extra_attack` (legendary) and `aoe_save_damage` (lair). Not wired to any current boss because per-encounter balance was tuned without them. A future boss (fourth-campaign showcase, or after Crypt Lord re-balance settles) is a better fit. More effect kinds (terrain shift, debuff aura, summon, multi-attack legendary) can be added as content demands them.
- [ ] **Party line-of-sight indicators on the grid** — Phase 2 of the grid-detail pass needs Bresenham LoS that respects the obstacles we just shipped. Visual: ghost-tint cells the active PC can't see; suppress enemy tokens in those cells beyond the existing `dark`-illum fog. ~1 day. Was in phase-2 but deferred to its own commit since it needs LoS-blocking through obstacles.
- [ ] **Fourth campaign module (opportunistic)** — coastal pirate town, desert ruin, planar city, etc. Stress-tests the format further. Not on the critical path.

---

## Type-share infrastructure

- [ ] **Phase 3 of type-share** (remaining workspace-local: Character, GameState, Seed, Trap, Room, OnHitEffect, BossPhase, EnemyTemplate, Enemy, Spell, BeastForm, InventoryItem, TurnActions, DeathSaves, Context/FrontendContext, Location, GameRule, RuleFacts, CampaignFacts) — these either depend on BE-only types that would cascade-share (Seed → Enemy → BossPhase → OnHitEffect; Location → Room → Trap), have FE-vs-BE structural differences requiring reconciliation (Character / GameState — FE has slim versions, BE has rich), or are intentionally separate (FrontendContext vs Context). Defer until there's a concrete reason to share each one.

---

## UX & polish

- [ ] **Tutorial / onboarding** (deferred-to-launch per user instruction). 2-room intro covering the action choice loop, grid combat, inventory modal. New players have nowhere to learn the controls today. Held until the engine surface stabilizes near launch — building this now means rebuilding every time a UI surface changes.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat sound cues.
- [ ] **LLM enhancement cost guards** (deferred-to-launch per user instruction). Per-session token budget, short-event skip threshold, `LLM_ENHANCEMENT=off` kill switch. Held until launch volume justifies it.

---

## Engine & infrastructure

- [ ] **Save/state persistence across redeploys (manual verify)** — `normalizeState` specs assert that a JSONB state row missing post-rollout fields loads cleanly and survives a `takeAction` call without crashing. Still TODO: actual end-to-end manual exercise — start a session, redeploy the backend container, resume the session, confirm parity. ~30 min.
- [ ] **Difficulty tuning from playtest data** — once playtests happen, capture damage/HP/encounter telemetry to inform tuning passes. Real fights are starting to expose where the math is off (Crypt Lord TPK was the first big signal). ~3-4h to wire telemetry; ongoing to tune.
- [~] **gameEngine.ts action-handler refactor (mostly shipped; resolveOneAttack + castSpell internal splits remain)** — 29 PRs across one session decomposed `takeAction`'s inline switch into per-action handler files under `services/actions/`. `gameEngine.ts` shrank 10,052 → 4,704 lines (-53%). All 38 action types dispatch through `services/actions/index.ts` against an `ActionContext` object; the inline switch is empty (just the default unknown-action fallback). `classFeature.ts` (the largest single case at 1,712 lines) fully decomposed by class into `classFeature/{barbarian,fighter,rogue,monk,druid,casters,cleric,paladinRangerBard,species,index}.ts`. `attack.ts` partially split (preattack/combatStart/toHit extracted; resolveOneAttack closure remains inline at ~615 lines). `castSpell.ts` (~840 lines) lifted but not internally split yet. Architectural addition: **transformer pattern** (`replaceWith` / `delegateTo` on handler return) for actions that yield to a different action — used by `attack_npc` and `use_reaction`; ready for future 5.5e features like Eldritch Strike, Counterspell, War Caster, Beast Form attack overrides. **What remains**:
  - [ ] **`resolveOneAttack` extraction from `attack/index.ts`** (~615 lines) — the inner closure captures ~25 outer-scope variables. Cleanest extraction: introduce `AttackContext` struct (extends `ToHitContext` with target/weapon fields), pass to a top-level `resolveOneAttack(ctx, atk, label)`. Mostly cosmetic — the file is already organized into named phases. ~1 PR.
  - [ ] **`castSpell.ts` internal split** (~840 lines) — same shape as classFeature/: precast (gates), heal, utility (Bless special-case), attackRoll, save, aoe (sphere/cone/cube/line), multiTarget (Magic Missile + Eldritch Blast). ~4-6 PRs.
  - [x] **Monk Flurry kill resolution + adjacent class-feature bugs**
    (audited + fixed 2026-05-22). The suspicious `ctx.roomId` write to
    `enemies_killed` was the tip of a bigger bug class: `monk.ts` (Flurry
    of Blows) and `paladinRangerBard.ts` (Colossus Slayer, Vow of Enmity,
    Abjure Enemy) plus `fighter.ts` (Trip Attack, Goading Attack) all
    used `e.id === ctx.roomId && e.isEnemy` as their entity-lookup
    predicate. Since entity ids are `${roomId}#0`, the predicate never
    matched — Flurry's damage path silently no-op'd, Colossus Slayer
    read 0 hp and "killed" a stale target on every cast, Vow of Enmity
    set `vow_of_enmity_target` to the room id so the `toHit.ts`
    advantage check never fired. All sites now key off `ctx.enemy?.id`.
    Flurry + Colossus Slayer also previously called `endCombatState`
    unconditionally on a kill — now gated behind `isRoomCleared` to
    match the canonical attack-handler pattern. The test that
    "covered" Flurry had a tautological `if (narrative.includes(...))
    expect(narrative).toMatch(...)` wrapper; replaced with `flurryColossus.spec.ts`
    (4 regression cases: damage applied, kill-bookkeeping with correct
    id, no early combat-end with other enemies in the room, Vow of
    Enmity target set to enemy id).
  - [ ] **Test gaps surfaced by sed false-positives** — PRs 15/16 sed translation introduced 3 latent bugs (`break;` → `return;` inside loops, sed-rewriting `enemy` inside string literals, if-chain breakage when deleting the first branch). All were fixed in PR 17 + caught manually during PR 20/25. The fact that 514 tests didn't catch them points to coverage gaps for Bless on 4+-member parties, Monk Flurry kill-on-first-strike, Frenzy with no enemy in range, and the unknown-feature fallback. ~2-3h to write targeted regression specs.

  See git history `3696339..1ced24e` (PRs 1-29) for full commit chain. Each PR is independently revertible; tests + lint + prettier gate every commit; no CI failures across the 29-PR series.

- [ ] **Pre-commit hook (Husky + lint-staged)** — auto-run eslint + prettier on staged files before commit. Catches the class of bug where prettier-dirty code reaches CI and fails the build. ~30 min setup; bypassable with `--no-verify`. CI lint stays as the gate.

- [x] **Multiplayer MVP — party-of-equals with per-PC ownership** (design locked + shipped 2026-05-21).
      All four PRs landed: PR 1 (data foundation), PR 2 (auth + turn enforcement),
      PR 3 (Socket.IO realtime push + WaitingForPlayer), PR 4 (invite link UX).
      Solo mode is unchanged — host owns every PC, no participant rejects, no
      waiting banner. Multi: friend opens the shared `?join=<token>` URL,
      becomes a participant, sees the full narrative chat via realtime
      broadcasts, but can't act until the host reassigns a PC via the
      assign-character endpoint (UI follow-up below). Three follow-ups
      remain before MP feels complete; tracked separately so the MVP itself
      reads as shipped.

  Follow-ups:
  - [x] **ParticipantsManager UI** (shipped — a97ce9c). Players & invites
        dialog now lists session_participants and gives the host a per-PC
        owner dropdown. Realtime Socket.IO 'state' broadcasts keep the
        dropdown values in sync. Realtime 'participants' (joined/left)
        listener still deferred — host has to close + reopen the dialog
        to see a freshly-joined friend.
  - [x] **Voluntary leave** (shipped — d42484e). Non-host participants
        have a "Leave session" button in the players dialog. Server auto-
        transfers PCs they owned to the host before removing them, so turn
        enforcement never encounters an orphan owner.
  - [x] **Race detection** (`turn_seq` column) — shipped 4d3b7bb.
        `game_sessions.turn_seq` bumps on every successful takeAction;
        clients send their last-known value with each action; server
        rejects with 409 on mismatch. useGame handles 409 by logging
        "out of sync" + resuming the session for fresh state.
  - [x] **Realtime participants refresh** — shipped 4d3b7bb.
        useGame listens for Socket.IO 'participants' events and bumps
        a participantsVersion counter; InviteDialog includes it in its
        fetch-participants useEffect deps so the list updates the
        moment a friend joins/leaves/has their PC reassigned.
        Each PC has exactly one human controller via `Character.owner_user_id`. Solo
        mode = host owns all PCs (no schema branch). 2+1 / 1+2 / 1+1+1 splits all
        fall out of the same row layout in `session_participants`. Every participant
        sees the full narrative (Socket.IO broadcast on every state change). Action
        buttons render only for the player whose PC is currently active; everyone
        else sees "Waiting for `<Name>` to finish their turn."

  **Design calls (locked)**
  - Invite UX: shareable link with a session-scoped `invite_token`.
  - No DM mode (yet) — strict party-of-equals. `session_participants.role`
    column carries a default `'pc'` value from day one so a `'dm'` role can
    be added later without a schema migration.
  - No voice — players use their own VC (Discord, etc.).

  **Invariants**
  - Each PR keeps singleplayer working. In solo mode every PC is owned by
    the host, so no guard ever rejects, no "waiting" banner ever renders.
  - Lead handoff (out-of-combat): only the current lead's owner can pass.
    No "claim the lead" escape hatch in MVP — add if AFK becomes a real
    problem in playtest.
  - Host disconnect = session paused (no actions accepted) until host
    reconnects. Simpler than promoting a new host.
  - Player disconnect = their PCs stay theirs; host can reassign via the
    participants modal if they don't return.
  - Inventory modal: viewing any PC's tab is allowed; Equip / Transfer /
    Drop only enabled for PCs you own.

  **Phases (~15-18h total, splittable into 4 PRs)**
  1. **Data foundation** (~4-5h). Migration: `session_participants(session_id,
user_id, joined_at, role text default 'pc')` table + index. Schema
     evolution: every PC's `owner_user_id` is set at character creation;
     `normalizeState` backfills missing values to `session.user_id` for
     existing sessions. Type: `Character.owner_user_id?: string` on the
     shared types. Specs: backfill correctness, default value on new
     PCs. **This PR is data-only — no behavior changes.**
  2. **Auth + turn enforcement** (~2h). Route guard: `/api/game/session/:id/*`
     checks the requesting user is a participant (was: owner). `takeAction`
     rejects when `req.user.id !== characters[active].owner_user_id` with
     a clean narrative. Reaction-routed actions check the eligible PC's
     owner instead of `active_character_id`. New endpoints:
     `POST /session/:id/assign-character` (host-only) and
     `POST /session/:id/join` (anyone with a valid invite token).
  3. **Realtime push** (~6-7h). After every successful `takeAction`,
     `io.to(\`session:${sessionId}\`).emit('state', result.newState)`.
Frontend `useGame`connects to the socket on session load and
replaces local state on each broadcast. Sequence number on the
broadcast envelope so out-of-order packets don't downgrade state.
Frontend: render`<WaitingForPlayer name={...} />` instead of the
     action pane when the active PC's owner isn't us.
  4. **Invite + participant management UX** (~3-4h). Generate per-session
     `invite_token`, build a shareable URL `?join=<token>`. Landing on
     that URL triggers login (if needed) → join → redirect to game.
     Participants modal (host only): list all participants + which PCs
     they own, allow host to reassign with a dropdown. "Rotate invite
     token" button for leaked links.

  **Deferred from MVP** (revisit after playtest)
  - Race detection (`turn_seq` column rejecting stale submissions when
    two participants race-click). Defer until it actually bites.
  - Chat MVP (`chat_messages` table + input + log). Players can use
    voice (Discord); chat is nice but not required for a working co-op.
  - Per-participant cosmetics (name colors in narrative attribution, etc.)
  - Spectator mode (a participant with no PC, observing only).
  - "Claim the lead" escape hatch for AFK lead owners.

### Architecture audit follow-ups

> **2026-05-21 architecture review** identified the rules/state seams that
> will make adding 5.5e features (more conditions, more spells, more
> monster abilities) progressively harder. Priority order below is by
> leverage — items 1-3 pay for themselves within 2-3 features and
> compound; 4-7 are medium-leverage; 8-9 are flagged but deferred.

#### High leverage (do first)

- [x] **1. Conditions registry** (shipped 2026-05-21). New module
      `services/conditions/registry.ts` is the single source of truth
      for condition rule data (duration, advantage/disadvantage,
      auto-fail saves, disadvantage saves, movement gates, on-expire
      hooks). The four ADV/DISADV Sets in rulesEngine + the
      `STR_DEX_AUTO_FAIL` set + the `CONDITION_DURATION` dict in
      gameEngine are gone — Sets are re-exported as derived views for
      compat; rulesEngine save logic now reads `autoFailsSave` /
      `disadvantageOnSave`; gameEngine `inflictCondition` /
      `tickConditions` use `getConditionDuration` / `applyExpiryHooks`
      (replaces the shield_spell AC -5 hack). 20 direct registry
      tests. Adding a new condition is now one registry entry.

- [x] **2. `applyDamage` helper** (shipped 2026-05-21, partial).
      `services/damage.ts` handles HP floor, temp-HP absorption,
      exhaustion-4 max-HP clamp, automatic concentration check,
      knock-out detection. **Closed latent bug:** four damage sites
      that bypassed concentration now route through the helper —
      `disarmTrap` (trap on fail), `gameEngine.ts:4179` (hidden trap),
      `gameEngine.ts:991` (lair action AoE — refactored from `.map`
      to loop so per-PC concentration breaks accumulate), and
      `inventory.ts` (mystery consumable, "can't kill" semantics
      preserved). 16 direct damage tests.

  **Deferred (separate follow-up PRs):**
  - **Resistance / vulnerability in helper** — current sites bypass
    it; helper signature is forward-compatible.
  - **`applyEnemyAttackNarrative` migration** — ~80-line block in
    gameEngine.ts with inlined resistance (Rage, Petrified, Beast
    Form, species), ward absorption (Abjurer), temp HP, exhaustion
    clamp, narrative tokens. Needs narrative-fragment rework
    (related to #4) before it can migrate safely.

  **Dropped from scope (closer inspection):**
  - **`reaction.ts` pending damage migration** — investigated
    2026-05-21 and dropped. The two PC-damage sites
    (Shield-declined-no-slot at reaction.ts:103,
    Shield-declined-explicit at reaction.ts:133) apply
    `pendingDamage` that's already had resistance, temp HP,
    exhaustion clamp, AND concentration check applied upstream by
    `applyEnemyAttackNarrative` (gameEngine.ts:3950). Routing
    through `applyDamage` would require both `skipConcentration` and
    `skipTempHp` to avoid double-processing, which makes the
    migration purely cosmetic. The Hellish Rebuke site at
    reaction.ts:203 is PC→enemy damage and outside `applyDamage`'s
    scope (enemies don't concentrate or carry temp HP). A separate
    real bug exists in the upstream flow — concentration is checked
    against pre-Shield damage, so a successful Shield block doesn't
    undo the spurious save — but that's a `applyEnemyAttackNarrative`
    bug, not a reaction.ts one.

- [x] **3. Action-economy invariants in the dispatcher** (shipped
      2026-05-21, partial). `services/actions/cost.ts` declares
      `ACTION_COSTS: Record<actionType, 'action' | 'bonusAction' |
      'reaction' | 'managed'>`. Dispatcher pre-checks the budget
      (rejects with standard narrative) and post-deducts on success.
      Handler contract gained a `{ rejected: string }` return variant
      for validation early-exits that don't consume the slot. Five
      clean handlers migrated (`dodge`, `disengage`, `dash`, `help`,
      `ready`): manual `if (action_used) error` + `action_used: true`
      removed; the dispatcher handles both. 13 direct cost-map tests.

  **Shipped 2026-05-21 (follow-up sweep):** `sneak`, `disarm_trap`,
  `grapple`, `shove`, `try_escape_grapple`, `use_reaction` migrated.
  Per-branch classification: validation early-exits (no enemy /
  out-of-reach / no trap / not located / not grappled / no readied)
  return `{ rejected: ... }` and don't consume the slot. Post-validation
  failure paths (grapple-immune / prone-immune target — RAW: the
  unarmed strike was committed) and the contested-roll paths run to
  void return; dispatcher post-deducts. `use_reaction`'s manual
  reaction-used pre-check went away — dispatcher pre-checks via
  declared cost 'reaction'.

  **Still 'managed' (variable per-feature cost — would need richer
  dispatcher contract):** `attack`, `cast_spell`, `use_class_feature`,
  `two_weapon_attack`, plus the free / out-of-combat handlers (`pass`,
  `end_turn`, `examine`, `move`, `loot`, `stand_up`, social/quest/travel
  handlers, etc.). These either consume budgets conditionally
  (Quickened Spell, Extra Attack, Nick property) or don't consume
  action economy at all.

#### Surfaced bugs (from this audit)

- [x] **Concentration save fires before Shield-reaction window**
      (shipped 2026-05-21 as part of 4C.4.B). The fix landed via
      the compute/commit split in `applyEnemyAttackNarrative` →
      `computeEnemyAttack`. The concentration save is now rolled
      into a *proposed* state that's discarded on Shield-accept —
      so a successful Shield no longer commits a failed
      concentration save. RAW-correct per SRD 5.2.1 p.203 (save
      fires on damage TAKEN, not threatened).

#### Medium leverage

- [~] **4. Narrative pipeline — mechanical/prose split, spell
      pools, structured fragments** (partial — 3 sub-PRs shipped
      2026-05-21; multi-stage migration ongoing).

  **Shipped:**
  - [x] **4B. `stripForLlm` + bracketed-note migration.** New helper
        in `narrativeFmt.ts` drops `{{note|...}}` tokens entirely
        from LLM input while keeping other tokens as display text
        (so `preservesCriticalFacts` still sees the numbers). 25
        inline `[mechanical aside]` brackets across the handlers
        (`attack/index.ts`, `castSpell.ts`, `loot.ts`,
        `examineDefault.ts`, `gameEngine.ts`) wrapped in
        `fmt.note(...)`. The LLM-fallback case is now readable:
        bracketed asides render as styled sidebar pills, not inline
        prose. 6 direct tests.
  - [x] **4A. Per-spell narrative pools.** `Spell.narratives.cast`
        pool with `{name}/{spell}/{slotNote}/{target}` token
        substitution. New `pickCastPrefix` helper in `castSpell.ts`
        replaces the 8 hardcoded `"{name} casts {spell}{slotNote}"`
        prefix sites. Three demo pools populated (Magic Missile,
        Fireball, Cure Wounds). Adding a new spell with flavor is
        now data, not code. 9 direct tests.
  - [x] **4C.1. Structured `NarrativeFragment[]` — attack vertical
        slice.** New `services/narrative/` module:
        `fragments.ts` (discriminated union) and `compose.ts` (per-
        kind renderers + `composeFragments` / `composeNow`).
        `ctx.fragments: NarrativeFragment[]` on `ActionContext`,
        composed after `dispatchAction` returns. Attack handler's
        four emission sites (fumble, miss, hit, kill) migrated to
        `composeNow(ctx, fragment)`; the composer is now the single
        source of truth for prose AND `CombatEvent`s for those
        outcomes. Bonus notes (Sneak Attack, Rage, Sacred Weapon,
        Assassinate, Studied Attacks, Graze, dmgNote) carried as
        structured `bonuses: {label: string}[]` payload. Wraps
        existing `buildCombatHitNarrative` rather than rebuilding
        prose logic. 9 direct tests.

  **Remaining:**
  - [x] **4C.2.A. Spell attack-roll paths migrated** (shipped
        2026-05-21). Two new fragment kinds `spell_attack_hit` /
        `spell_attack_miss` (both emit existing `attack_hit` /
        `attack_miss` CombatEvent kinds, so spell outcomes now
        appear in `combat_log` for the first time). Composer
        renderers mirror the pre-migration prose
        (`<castPrefix>!<atkNote> [Critical spell hit! ]<dmg>
        damage!<bonuses>`). `pickCastPrefix` runs handler-side so
        the composer doesn't import `castSpell` (no circular dep).
        Agonizing Blast bonus migrates to `fragment.bonuses[]`. 5
        direct tests.
  - [x] **4C.2.B. Spell save / heal / utility / multi-target / AOE
        paths migrated** (shipped 2026-05-21). 6 new fragment kinds:
        `spell_heal`, `spell_utility`, `spell_save_damage`,
        `spell_save_condition`, `spell_auto_hit`, `spell_multi_target`.
        Composer return shape generalized to `{ prose; events:
        CombatEvent[] }` so renderers emit zero events (heal /
        utility), one event (most kinds), or many (multi-target →
        one `attack_hit` per damaged target). Disciple of Life
        bonus moved from inline bracketed prose to `bonuses[]` (wraps
        in `fmt.note`, excluded from LLM input). Save / auto-hit /
        multi-target spell outcomes now appear in combat_log for
        the first time. 11 new tests. **The Cunning Strike /
        weapon-mastery `condition_applied` post-hit pushEvent
        sweep is still deferred** — needs a `condition_applied`
        fragment kind; not in 4C.2.B scope.
  - [ ] **4C.3. Class-feature handler migration.**
        `classFeature/*.ts` files emit ad-hoc narrative + events for
        Stunning Strike, Divine Smite, Flurry of Blows, etc. Each
        needs a fragment kind or to reuse the spell/attack kinds
        where shape overlaps.
  - [x] **4C.4.A. `applyEnemyAttackNarrative` damage-pipeline
        migration** (shipped 2026-05-21). **PR-2's deferred
        follow-up is closed.** `applyEnemyAttackNarrative` now
        takes `st` and routes damage through `applyDamage` —
        temp_hp absorption, exhaustion-4 clamp, and concentration
        check all run via the helper. ~50 lines of inline math
        removed. Function signature simplified: returns
        `{ newChar, newSt, hpLost, narrative, atkTotal, hit, ...}`
        — `newChar` carries the full character mutation so callers
        write it back wholesale instead of threading temp_hp /
        conditions / condition_durations / class_resource_uses /
        concentrating_on / inspiration / bardic_inspiration_die
        individually. Both call sites updated (legendary action +
        enemy-turn loop). Orc Relentless Endurance and Massive
        Damage Death checks stay in the caller. Resistance / ward
        math stays inline (PC-specific, not generalized into
        `applyDamage`). All 603 BE tests still pass.
  - [x] **4C.4.B. Enemy-side narrative fragments + Shield-window
        fragment stashing** (shipped 2026-05-21). Two new fragment
        kinds `enemy_attack_hit` / `enemy_attack_miss` carry the
        full attack prose + event payload. `applyEnemyAttackNarrative`
        split into `computeEnemyAttack` (pure compute, returns
        proposed char/state + fragment) and a commit step at the
        caller. `PendingShieldReaction.pendingDamage` /
        `pendingNarrative` replaced with `pendingFragment` /
        `pendingProposedChar` / `pendingProposedSt` (typed as
        `unknown` in shared-types since FE doesn't introspect them;
        BE narrows via cast). Closes the Shield-vs-concentration
        ordering bug — Shield-accept discards the proposed state,
        so a failed concentration save rolled during compute is
        thrown away when no damage actually lands. Enemy turn loop
        + legendary action call site updated. `enemyAttackFragmentEvent`
        adapter helper bridges non-ctx callers to the composer's
        CombatEvent shape. 4 direct tests for the new renderers.
  - [x] **4C.5. `reaction.ts` Shield resolver migration**
        (shipped 2026-05-21 as part of 4C.4.B). `commitProposed`
        helper in `reaction.ts` writes the proposed snapshot and
        pushes the `attack_hit` event via `enemyAttackFragmentEvent`.
        Three Shield outcomes: accept-no-slot commits proposed,
        accept-with-slot discards proposed (concentration unaffected),
        decline commits proposed with " (Shield declined.)" suffix.
        Hellish Rebuke path unchanged (after-damage reaction; no
        stashed fragment needed).
  - [ ] **`twoWeaponAttack` fragment migration.** The off-hand
        attack uses a different narrative shape (`"Off-hand strike
        with..."`) than `buildCombatHitNarrative`. Migration needs
        either a new `two_weapon_hit` fragment kind (cleaner) or
        prose alignment with the main attack (changes visible text
        — see existing `/Off-hand/` test assertion). Deferred from
        4C.1 because it's a product-flavor decision, not a
        technical blocker. Also: today twoWeaponAttack emits
        narrative WITHOUT corresponding `CombatEvent`s — fixing
        that mid-migration adds events to combat_log for the first
        time for off-hand outcomes.
  - [ ] **Cleave-hit migration.** The `[Cleave: ...]` note in
        `attack/index.ts:~560` stays inline today; it's a
        secondary-target damage application that doesn't currently
        emit its own `CombatEvent`. Promote to a fragment kind when
        a feature actually needs cleave outcomes in the log
        (e.g. visualizing the cleave target on the grid).
  - [ ] **`resolveTarget(ctx, action)` helper.** Originally part of
        item 4 with the fragments work. Lower leverage on its own
        — saves ~10 lines across 5 sites
        (`combatTactical.ts`, `attack/preattack.ts`,
        `twoWeaponAttack.ts`, `castSpell.ts`). Bundle with the
        spell-handler migration (4C.2) since both touch the same
        target-resolution code.

- [~] **5. Monsters as first-class action subjects** (extraction
      phase complete; dispatcher integration deferred). The
      `runEnemyTurns` closure went from 460 → 191 lines (-58%) by
      lifting every cohesive sub-routine into a named free function
      with an explicit input/output contract.

  **Shipped 2026-05-21 — five extractions:**
  - `resolveEnemyHideCheck(enemy, target, idx, st)` — 2024 PHB Hide
    DC check (passive Perception → active Search fallback). Returns
    `{outcome, st, target, narrative}`. 4 direct tests.
  - `selectEnemyMeleeTarget(enemyId, st)` — nearest-living-PC
    targeting AI. Returns `{enemyEnt, targetEnt, targetCharIdx}`.
    Skips dead PCs + companions. 5 direct tests.
  - `attemptEnemySpellCast({...})` — spell-cast intent + counterspell
    window + spell resolution. Returns discriminated union
    `'no-cast' | 'counterspell-pending' | 'spell-resolved'` so the
    closure has a clean three-way dispatch. ~90 lines lifted.
  - `attemptEnemyApproach({...})` — pathfinding + opportunity
    attacks + position commit. Returns `'proceed-to-attack'`
    (carrying `movementHeaderPrinted` flag) or `'skip-turn'`
    (no path / OA-killed / out-of-reach-after-move). ~90 lines lifted.
  - `runEnemyMultiattackLoop({...})` — the multiattack body with
    both reaction pause points (Shield BEFORE damage commit;
    Hellish Rebuke AFTER damage commit). Returns `'paused'` or
    `'completed'` (with `massiveDeath` flag for the dead-target
    check). Orc Relentless Endurance + Massive Damage Death stay
    inside. ~115 lines lifted.
  - All parallel-write sites in the enemy-turn path now route
    through `commitCharacter` — drift risks eliminated.

  The closure body is now a sequence of named handler calls:
  surprised → legendary refresh → select target → hide check →
  spell cast → approach → multiattack → death save → commit →
  advance.

  **Phase 1 dispatcher integration shipped 2026-05-21 — type seam:**
  - New `services/actions/actor.ts` module: `Actor` discriminated
    union (`PcActor` | `EnemyActor`) + constructor helpers
    `pcActor(char, safeIdx)` and `enemyActor(enemy, ent?)`. 6
    direct tests for the constructors + narrowing behavior.
  - `ActionContext` gained an `actor: Actor` field. `takeAction`
    populates it as `pcActor(char, safeIdx)` so existing handlers
    have a polymorphic source ready when they want to migrate.
    `ctx.char` and `ctx.safeIdx` stay for back-compat; nothing
    changes for current handlers.
  - Five-phase migration roadmap documented in
    `services/actions/actor.ts`:
    1. ✅ Type seam (this PR).
    2. Pilot one handler reading from `ctx.actor` instead of `ctx.char`.
    3. Migrate more handlers, narrowing via discriminant when
       PC-specific data is needed.
    4. Wire enemy turns to invoke `dispatchAction` with an enemy
       actor; the closure-extracted helpers (Phase 5 above) become
       registered handlers.
    5. Drop `ctx.char` / `ctx.safeIdx` once every handler reads
       from `ctx.actor`. Shared abilities (Stunning Strike, Divine
       Smite, ...) work for PCs and monsters from one implementation.

  **Remaining (future sessions):** phases 2-5 above. Each phase
  is a separate PR sequence. The Phase 1 type seam makes phases 2-3
  mechanical (per-handler narrowing) and unblocks phase 4 (the
  dispatcher entry point now has somewhere to write enemy actor data).

- [x] **6. Single grid/character HP source of truth** (shipped
      2026-05-21). New free function `commitCharacter(st, char)` in
      `gameEngine.ts` is the single seam for writing PC HP /
      conditions — updates both `characters[]` and the mirrored
      `entities[]` entry in one place. Two parallel-write sites
      refactored: `applyEnemySpellDamage` (gameEngine.ts) and the
      heal-other-PC path in `inventory.ts`. The closure-scoped
      `commitChar` inside `takeAction` and the `ctx.commitChar()`
      method on ActionContext both delegate to the free function
      (three copies → one). `CombatEntity.hp` / `CombatEntity.conditions`
      JSDoc documents the mirror policy: enemies are authoritative,
      PCs are mirrored, writes route through `commitCharacter`. 6
      direct tests. Wire format unchanged; FE continues to read
      `entity.hp` for grid rendering.

- [x] **7. Schema version on saved state** (shipped 2026-05-21). New
      `services/stateSchema.ts` module with `CURRENT_SCHEMA_VERSION`
      constant + `applyStateMigrations(state)` ladder.
      `normalizeState` (gameEngine.ts) stamps the version on every
      load; pre-versioning saves are treated as v0 and routed
      through `migrateV0ToV1` (no-op besides version stamp). Forward
      compat: a save written by a newer engine and loaded by an
      older deploy passes through unchanged. Version-bump policy
      documented at the top of stateSchema.ts. Future schema changes
      that need per-row logic now have a defined entry point. 4
      direct tests.

#### Test-suite cleanup (shipped 2026-05-21)

- [x] **PR A. Shared test fixtures.** New `src/backend/src/test-fixtures.ts`
      module with canonical `makeChar`, `makeState`, `makeEnemy`,
      `makeMinimalContext`, `mockRandom`, plus per-class scenario
      builders (`makeMageState`, `makeClericState`) and the canonical
      seeds (`baseSandboxSeed`, `seedWithEnemy`, `dungeonSeedWithEnemy`,
      `spellSeed`, `ctxWithRage`). 6 specs migrated; ~400 lines of
      inline fixture duplication eliminated. `mockRandom` no longer
      defined twice (was in rulesEngine.spec.ts and damage.spec.ts).
- [x] **PR B. Split `gameEngine.spec.ts`** into domain-cohesive
      specs colocated with the engine. Five new files:
      `gameEngine.boss_encounters.spec.ts`,
      `gameEngine.cast_spell.spec.ts`,
      `gameEngine.conditions.spec.ts`,
      `gameEngine.class_features.spec.ts`,
      `gameEngine.grid_combat.spec.ts`.
      Main spec went from 10,711 → 5,575 lines (-48%). 608 tests
      preserved across 18 spec files.
- [x] **PR C. Resolve 4 `it.todo` tests in `rulesEngine.spec.ts`.**
      All obsolete: movement tracking and concentration-on-damage
      are implemented (via `movement_used` field and
      `checkConcentration` in damage.ts), bonus-action-spell-restriction
      was removed by the 2024 PHB, and two-handed-weapon-spellcasting
      is an RAW edge case not modeled. `future systems` describe
      block deleted.
- [x] **PR D. Vale spec duplication check** — no-op. The two files
      are complementary across layers:
      `contexts/vale_of_shadows.spec.ts` (BE, vitest) validates the
      quest engine + state machine in isolation; `tests/e2e/vale-smoke.spec.ts`
      (Playwright) validates the full HTTP/DB/UI stack. Different
      runners, different assertions, different failure modes.

#### Lower urgency (flag now, defer)

- [ ] **8. Multiplayer delta protocol** — full-state replace per action
      is fine at current scale. Once campaign state grows (more PCs,
      larger maps, persistent NPCs) broadcast size will hurt. Don't
      prebuild — wait until measured pain.

- [ ] **9. Spell-slot / HP / action-budget server-side invariants** —
      `castSpell` checks slots before decrementing only as a permission
      gate that returns an error narrative; stale-state actions get
      accepted. With `turn_seq` already on the wire, server-side
      assertions can reject with 409 (same path the FE already handles)
      for `spell_slots_used <= max`, `hp <= max_hp`, action-economy
      budget. Tighten when an exploit surfaces.

#### Pre-existing (kept for reference)

- [ ] **Observability** (needs-input) — only `console.log` today. Sentry / structured logging / error tracking would surface prod issues. Requires choosing a service (paid SaaS or self-hosted).
- [ ] **CHANGELOG.md** (needs-input) — no user-visible change log. Should we keep one? Format (Keep-a-Changelog, conventional commits, etc.)?
- [ ] **Post-deploy health check + rollback** (needs-input) — CI deploys via SSM but doesn't poll `/api/health` after to verify, nor roll back on failure. Bad deploys 500 prod until manual intervention. ~2-3h to wire properly.

---

## Accessibility audit (2026-05-21)

> Code-survey pass focused on WCAG 2.1 AA. The engine is already strong
> on focus-visible outlines (global `:focus-visible` rule), aria-labels
> on icon-only buttons (MoveDPad/SpellBar/CombatActionBar), tablist
> semantics + arrow-key navigation on ContextPanel, focus-trap +
> Esc-close on Dialog, aria-live polite on the combat narrative, and
> proper `<button>` elements for clickable party tiles. Items below are
> the gaps the survey found; manual screen-reader + keyboard-only
> validation is the next step.

### Shipped 2026-05-21

- [x] **Skip-to-main link** — `<a href="#main-content">` becomes visible-on-focus, lands keyboard users past the header on `<main id="main-content">`. WCAG 2.4.1.
- [x] **CharScreen label htmlFor** — name / class / subclass / species / background fields now use `htmlFor` + matching `id={\`char-${idx}-X\`}` so SR announces the field name on focus.
- [x] **Player avatar meaningful alt** — PartyRail / InventoryModal / SessionScreen portraits now read `"${name}'s portrait"` (was `alt=""`). User's own header avatar stays `alt=""` since the name is in adjacent text.
- [x] **`.choiceBtnSeen` contrast** — was `opacity:0.45` + `--t-dim` ≈ 1.86:1 (WCAG AA fail). Now `opacity:0.7` + `--t-mid` ≈ 4.75:1 (passes). Hover restores full color.
- [x] **MoveDPad keyboard navigation** — WAI-ARIA Composite Widget pattern: roving tabindex (one focused cell at a time), arrow keys move focus spatially, arrow keys skip past disabled cells. 3 spec assertions cover the behavior.

### Remaining

- [ ] **fieldset/legend on grouped form controls** — CharScreen's `PORTRAIT` and `ABILITY SCORES` "labels" are group descriptors (govern multiple buttons) but use plain `<label>` without an `htmlFor`. The right HTML is `<fieldset><legend>` (or `<div role="group" aria-labelledby="...">`). Larger refactor than the simple-label htmlFor pass already shipped.
- [ ] **HP / condition live-region updates** — the combat narrative has `aria-live="polite"` so SR users hear what happened, but HP-bar fills and condition badges update silently. An off-screen `aria-live` summary of the most recent delta (`Fighter HP 18, conditions: frightened`) would help SR users track state without re-listening to the full narrative. Needs UX tuning on when to announce vs. when to stay quiet.
- [ ] **Manual SR + keyboard-only validation** — code survey done; next step is exercising the app with VoiceOver / NVDA / JAWS and Tab-only to find the things the code review missed.

---

## Security audit (2026-05-21)

> Code-survey pass focused on OWASP Top 10 and multiplayer-readiness.
> Solid foundation already: helmet headers, CORS pinned to FRONTEND_URL,
> Postgres-backed sessions with httpOnly + secure + sameSite cookies,
> rate-limit on `/api/auth/*`, `trust proxy 1` for nginx, all DB queries
> parameterized ($1/$2 placeholders), passport+Google OAuth. The single-
> tenant model masks several issues that will bite when session_participants
> lands.

### Shipped 2026-05-21

- [x] **SESSION_SECRET fail-fast** — was `?? 'change-me-in-production'`. Now boot throws if env is missing — refuses to accept requests against a known-secret session signing key.
- [x] **Rate limit on `/api/game/*`** — 120 req/min `gameLimiter` sits after `requireAuth` and before `gameRouter`. Throttles takeAction spam without affecting normal play.
- [x] **Socket.IO `join-session` ownership check** — session middleware is now shared between Express and `io.engine.use(...)`. Before joining a session's room, we read `req.session.passport.user` and run a `SELECT 1 FROM game_sessions WHERE id = $1 AND user_id = $2`. Single-tenant today; will broaden via `session_participants` when multiplayer lands.

### Remaining

- [ ] **No CSRF protection on state-changing endpoints** — cookies use `sameSite: 'none'` in prod (required for cross-origin SPA + API), so the browser sends the session cookie on cross-origin POSTs. A malicious site could trigger `POST /api/game/session/:id/action` via a logged-in user. Options: (a) tighten to `sameSite: 'lax'` if cross-origin isn't actually needed — confirm the prod FE + API domain layout; (b) add a double-submit CSRF token; (c) require a custom header like `X-Requested-With: XMLHttpRequest` (lightweight but defense-in-depth only). **Needs design call before implementation.**
- [ ] **Multiplayer: session ownership + turn enforcement** (already in main TODO) — `game_sessions.user_id` is single-tenant; `takeAction` doesn't verify `req.user.id === characters[active].owner_user_id`. Documented above under Multiplayer; flagged here so the security pass references it.
- [ ] **`npm audit` in CI** — no automated dependency-vuln check. Add a job to PR builds that fails on `high` or `critical`. ~15 min YAML edit; ongoing maintenance to triage findings.
- [ ] **CSP for any future HTML-serving paths** — helmet's CSP is disabled (`contentSecurityPolicy: false`) because the API doesn't return HTML. If we ever serve uploaded files or generated images directly, re-enable CSP with a tight `script-src 'self'` policy.
- [ ] **Session fixation protection** — `express-session` doesn't rotate the session id on login. Passport regenerates by default but worth confirming. Tested by logging in, copying the cookie, logging out, logging in again — should produce a new cookie.

---

## Deployment reference

Already shipped: ECR, EC2, RDS, ALB-less direct EC2 + nginx, Let's Encrypt with certbot webroot auto-renew, GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker Compose prod. The required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
