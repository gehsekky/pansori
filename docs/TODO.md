# TODO

<!-- Completed items pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## 5e SRD remaining gaps

> **Edition alignment** — Pansori targets 2024 PHB / SRD 5.2.1. The Top 5
> (weapon masteries, class feature audit, inspiration spend, Hide DC,
> multi-target spells) plus all 48 RAW subclasses (selectable as of
> 2026-05-22; mechanical features wired for the majority) plus the bulk
> of subsystems are shipped; remaining RAW gaps are small-impact, content-
> data follow-ups, or architecturally blocked.

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
  - [x] Lucky's spend hook (2026-05-22). New `use_luck` action
    mirrors `spend_inspiration`'s shape — sets
    `turn_actions.luck_pending`, decrements `feat_lucky_uses`.
    Coverage:
    - **Attack rolls:** `attack/toHit.ts` consumes the flag as an
      advantage source.
    - **Skill checks:** new `consumeLuckForCheck(char)` helper
      threaded through `interactObject` (search), `sneak` (group
      stealth), and `classFeature/rogue` (Cunning Action Hide).
    - **Saves:** `conditionSavingThrow` (the onHit-effect save path
      that handles enemy attack riders like stunning / paralysis)
      reads `luck_pending` and returns a `luckConsumed` flag the
      caller uses to clear it. Narrative surfaces "🍀 Luck point
      spent on the save".
    - **Ability checks (Influence + Study):** ad-hoc d20 sites
      consume luck via `consumeLuckForCheck` + roll-2-take-higher.
    `resetFeatLongRestResources` refills the pool on long rest.
    RAW spend-after-roll timing still deferred (MVP is
    spend-before-roll). AoE saves (lair-action sweeps) and death
    saves intentionally don't auto-consume (multi-roll / no
    decision point).
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
  - [x] Magic Initiate (shipped 2026-05-22 — full BE + FE). Three
    seed feats — `magic_initiate_arcane / divine / primal` — each
    granting 2 cantrips + 1 L1 spell. `take_feat` action accepts
    `cantripChoices: string[]` + `l1Choice: string`; `applyFeatTake`
    appends them to `spells_known`, records the L1 id on
    `feat_choices[featId].magicInitiateL1`, and seeds
    `class_resource_uses.magic_initiate_l1_used = 0`. castSpell.ts
    recognizes the recorded L1 spell at cast time: if the token is
    available and the cast is at the spell's base level, consumes
    the token instead of a slot. Upcasts still use a slot.
    `resetFeatLongRestResources` clears the token on long rest.

    **FE picker shipped 2026-05-22.** `SpellPickerDialog` component
    + CharScreen integration. `/api/game/contexts` extended to
    return `originFeat` per background plus a slim `featTable` + L1/
    cantrip `spells` (with `spellList` tags). CharScreen fetches the
    BE summary on mount; when the player picks a background whose
    origin feat is one of the three Magic Initiate variants, a
    chooser button surfaces inline ("⚠ Magic Initiate (Arcane) —
    pick 2 cantrips + 1 L1 spell"). Click → modal with checkbox-
    limited cantrips + radio-pick L1 (filtered by spell list).
    Picks persist to the per-context party draft so a reload doesn't
    drop them. `handle()` blocks Start when picks are incomplete.
    `CharacterInput.feat_choices` plumbs through `POST /session/new`
    via a new `FeatChoicesSchema` (Zod) and into `applyFeatTake`.
    Sandbox `Sage` → `magic_initiate_arcane`, `Acolyte` →
    `magic_initiate_divine` per 2024 PHB (the placeholders called
    out in `sandbox.ts` comments). 9 added FE tests + existing BE
    Magic Initiate coverage carries the new path.

    **Spell-list tagging shipped 2026-05-22.** `Spell.spellList?:
    Array<'arcane'|'divine'|'primal'>` field added; all 30 SRD
    spells tagged per 2024 PHB class lists. `take_feat` action now
    validates Magic Initiate choices: cantrip count matches the
    feat's required count, every choice exists in spellTable, level
    matches (cantrip vs L1), and `spell.spellList` includes the
    feat's `spellList` ('arcane' / 'divine' / 'primal'). 4 added
    validation tests.
  - ~~More feats: Resilient, Mobile, Sentinel, War Caster, Polearm
    Master, Great Weapon Master, Heavy Armor Master, Crossbow
    Expert, Tavern Brawler, Magic Initiate~~ — all shipped
    2026-05-22. Plus additional 2024 PHB feats wired this session
    (each with mechanical hook, not just data):
    - **Skilled** — choose 3 skill profs (`skill-proficiencies`
      effect kind).
    - **Observant** — half-feat: +1 INT/WIS, advantage on
      Investigation/Perception/Insight checks (effect surfaced via
      a feats helper used by ad-hoc d20 sites).
    - **Healer** — `use_healer_kit` action heals 1d6+4+prof; spends
      a kit charge (item count). Stabilizes on use even at 0 HP.
    - **Dual Wielder** — relaxes off-hand-light rule so any one-
      handed melee qualifies for TWF; gates the off-hand path.
    - **Athlete** — half-feat: +1 STR/DEX, partial climbing-speed
      grant (no movement-mode model — narrative-only); standing
      from prone costs 5 ft instead of half speed.
    - **Polearm Master (full)** — bonus-action butt-end attack
      (1d4 + ability mod) shipped, plus the OA-on-enter-reach
      trigger via `pamEnterReachTriggers` in gridEngine.
    - **Great Weapon Master (full)** — damage rider (already
      shipped) + the bonus-action attack on Crit-or-kill with a
      heavy weapon. Flag `turn_actions.gwm_bonus_attack_pending`
      set in the attack handler; consumed by `gwm_bonus_attack`
      handler.
    - **Crossbow Expert** — ignores loading on crossbows + ranged
      attacks within 5 ft of enemy don't impose disadvantage.
      Wired in toHit + ammo-consumption paths. Also added the
      missing crossbow weapons (hand / light / heavy) to sandbox
      loot.
    Each was ~30-100 lines of data + integration. See git history
    for the per-PR details.

    **2024 PHB origin feats added 2026-05-22:**
    - **Alert** (`kind: 'alert'`) — `+profBonus` to initiative
      rolls, wired in `buildInitiativeOrder` (reads `char.feats`
      and adds `profBonus(level)` when present). Surprise immunity
      is a no-op in pansori today (PCs can't currently be
      surprised — only enemies can via the party stealth check at
      combat start) but the feat data is in place for when PC
      surprise lands.
    - **Savage Attacker** (`kind: 'savage-attacker'`) — once per
      turn, weapon-damage hits reroll and take the higher total.
      Gates on `turn_actions.savage_attacker_used` (auto-cleared
      on next turn via FRESH_TURN). Unarmed strikes excluded per
      RAW ("weapon's damage roll"). 5 direct tests covering both
      feats (initiative bonus, per-turn limit, feat-absent no-op).

    **2024 PHB general feats added 2026-05-22:**
    - **Resilient** — half-feat: +1 to chosen ability + save
      proficiency in that ability. Pure data; reuses existing
      `abilityBonus.choices` + `save-proficiency` effect kinds.
      L4+ prereq.
    - **Mobile** (`kind: 'speed-bonus'; bonusFeet: 10`) — +10 ft
      speed. Wired in `effectiveSpeed` (which is called from
      grid_move, dash, etc., so the bonus lands everywhere
      automatically). Stacks with Goliath Large Form; encumbrance
      still reduces post-bonus speed normally. The two other RAW
      benefits (no difficult-terrain Dash slowdown, melee-attack
      target can't OA you) aren't modeled yet. New `speed-bonus`
      effect kind documents the bonus on feat data; the
      `effectiveSpeed` hook hardcodes the feat id for now (will
      factor into a feats helper when a 2nd speed-bonus feat
      ships). L4+ prereq.
    - **War Caster** (`kind: 'war-caster'`) — advantage on CON
      saves to maintain concentration when damaged. Wired in
      `checkConcentration` — rolls 2d20 keep-higher when the PC
      has the feat. Narrative notes "(War Caster advantage)" on
      both hold and break outcomes. Two other RAW benefits
      deferred: somatic spell components with hands full (pansori
      doesn't model hand state) and opportunity-cast spell as a
      reaction (needs a reaction-window redesign). L4 + Spellcasting
      feature prereq.
    - **Heavy Armor Master** (`kind: 'heavy-armor-master'`) —
      while wearing heavy armor and not incapacitated, attacks
      against you deal 3 less damage (floor 0). Wired as a
      last-step reduction in `computeEnemyAttack`, after
      resistance + Arcane Ward but before applyDamage. Uses an
      independent armor-loot lookup via `instance_id` to side-
      step the pre-existing buggy `armorItem` lookup in the same
      function (documented inline; fix in a separate PR since
      the deflected-narrative path depends on the broken
      behavior). L4 + heavy-armor proficiency prereq. The take-
      time heavy-armor proficiency grant isn't wired (would need
      `applyFeatTake` to add 'heavy' to char.armor_proficiencies).
    - **Tavern Brawler** (`kind: 'tavern-brawler'`) — half-feat:
      +1 STR or CON; unarmed strikes deal 1d4 + STR mod instead
      of 1 + STR mod. `unarmedDamage(str, tavernBrawler?)` now
      takes the flag; attack handler threads it from
      `(char.feats ?? []).includes('tavern_brawler')`. Two RAW
      benefits skipped: improvised-weapon proficiency (pansori
      doesn't model improvised weapons) and free Shove on
      unarmed hit (needs a new action shape).
    21 added tests cover the five feats.
  - ASI-vs-feat UX on the FE (both `apply_asi` and `take_feat`
    actions are available when `asi_pending` is set; FE picks the
    surfacing).
- [~] **Multiclassing** (Phase 1 type seam — shipped 2026-05-22).
      `Character.class_levels?: Record<string, number>` added (keys
      lowercased, values per-class levels). New
      `services/multiclass.ts` exposes read-side helpers
      (`getClassLevels`, `getClassLevel`, `hasClass`, `getTotalLevel`,
      `getAllClasses`, `getPrimaryClass`) that transparently fall back
      to `{[character_class]: level}` for legacy single-class PCs.
      Character creation in `routes/game.ts` initializes
      `class_levels = { [first_class]: 1 }`; `normalizeState` backfills
      pre-multiclass saves on load. No behavior changes — call sites
      continue to read `char.character_class` + `char.level`.

  **Remaining (separate PRs, in rough dependency order):**
  - [x] **Spell-slot multiclass calc** (Phase 2 — shipped 2026-05-22).
    New `spellSlotsForChar(char)` in `services/multiclass.ts` sums
    caster-level contributions (full × 1 / half ÷ 2 / third ÷ 3 for
    Eldritch Knight / Arcane Trickster) and looks up the multiclass
    slot table. Pure-warlock returns pact slots. Multi-class with
    warlock merges the two pools at matching slot levels (known
    approximation; RAW separates them — fix deferred to a pact-vs-
    multiclass schema split). `rulesEngine.ts` refactored to expose
    `spellSlotsForCasterLevel(level)` so both single-class and
    multiclass paths index the same table constant.
    `normalizeState` migrated; level-up + `rest.ts` warlock refresh
    deferred (work correctly for the single-class case they handle).
    9 added tests (single-class parity, full+full sum, half+full sum,
    half-rounds-down, primary-only subclass limit, pure warlock,
    warlock+full merge approximation).
  - [x] **Multiclass prerequisites** (Phase 3 — shipped 2026-05-22).
    `MULTICLASS_PREREQS` table in `services/multiclass.ts` covers all
    12 SRD classes (AND for single + multi-ability requirements;
    Fighter is the one OR — STR 13 or DEX 13). `canMulticlassInto(char,
    class)` returns empty on success or a human-readable reason
    (mirrors the `canTakeFeat` shape). First-class checks are
    auto-passed since RAW prereqs gate multiclassing in, not
    character creation. 9 added tests (single-AND, multi-AND, OR,
    unknown class, primary class fast-path). Level-up surfacing
    (which calls this when the player picks a non-primary class)
    lands in the Phase 6 / level-up UX PR.
  - [x] **Feature gating by per-class level** (Phase 4 — shipped
    2026-05-22). ~50 call sites across 13 files migrated from
    `char.character_class.toLowerCase() === 'X' && char.level >= N`
    to `hasClass(char, 'X') && getClassLevel(char, 'X') >= N`.
    Resource pools (rage uses, ki points, sorcery points, Bardic
    Inspiration die, Second Wind heal, Sneak Attack dice, Wild Shape
    CR access, Druid Natural Recovery budget, Cleric Sear Undead /
    Preserve Life scaling, Improved Divine Smite, Sorcerer Draconic
    Resilience HP, Arcane Ward HP) now scale with the relevant
    per-class level. Per-rest refreshes (`short_rest` handler)
    refresh ALL of a multi-class PC's eligible pools at once.
    Spell prep enforcement (`prepClasses.some(c => hasClass(...))`)
    triggers if ANY class is Cleric/Paladin/Druid. Class-gated
    eligibility helpers (`isUncannyDodgeEligible`,
    `isHellishRebukeEligible`, Thief Fast Hands) all key off
    `hasClass`. Three remaining `character_class.toLowerCase()`
    sites are intentional primary-class semantics (subclass-picker
    for primary class, `normalizeState` legacy-save backfill, char
    creation init).
  - [~] **Saving-throw profs from first class only** (Phase 5 —
    partial 2026-05-22). Saving-throw proficiencies are character-
    creation-time and tied to `character_class` (the primary), so
    the "first-class only" rule is already correct semantics. **What
    shipped:** armor + weapon proficiency grants on multiclass entry
    via `applyMulticlassProfGrants` — 2024 PHB narrow-subset table
    in `services/multiclass.ts` (e.g. Cleric grants light/medium
    armor + shield; Wizard / Sorcerer grant nothing). Called from
    `applyLevelUpForClass` on the FIRST level in a non-primary class.
    **Remaining:** skill + tool + instrument grants that require a
    player chooser (Bard, Ranger, Rogue each grant one Skill; Bard
    grants one Musical Instrument). Lands with the level-up UX PR.
  - [x] **ASI gating** (Phase 6 — shipped 2026-05-22). `asi_pending`
    now flags on a per-class milestone (`class_levels[X]` lands on
    4, 8, 12, 16, or 19) instead of the total character level. For
    pure single-class PCs nothing changes (class level == total
    level). Multi-class PCs no longer get a spurious ASI on the
    SECOND level (Fighter 3 / Wizard 1 → total 4 doesn't fire ASI;
    Fighter 4 / Wizard 0 → fighter level 4 does fire).
  - [x] **Level-up UX** (Phase 7 — shipped 2026-05-22). Backend:
    `level_up_class { className }` action validates out-of-combat,
    level cap (20), XP threshold, and multiclass prereq on class
    **entry** (skipped for continuation in an already-taken class).
    Delegates to `applyLevelUpForClass(char, className, context)`
    which bumps `char.level` + `class_levels[className]` in lockstep
    and applies HP / spell slot recompute / per-class ASI / multiclass
    prof grants. Auto-level-up from XP (kill events) still defaults
    to the primary class, so single-class behavior is unchanged.
    13 BE tests cover XP gating, combat-block, level cap, primary-
    class permissiveness, prereq enforcement, per-class ASI boundary,
    prof grant timing, and multiclass spell-slot recompute.

    **FE chooser:** `LevelUpDialog` component + `lib/multiclass.ts`
    helper (mirrors the BE `MULTICLASS_PREREQS` / `canMulticlassInto`
    shape for up-front render — the BE re-validates so a stat change
    between trigger and selection still gates correctly). `PartyRail`
    shows a `+LVL` badge + "LEVEL UP →" button on any PC tile whose
    XP ≥ next threshold (out-of-combat only); clicking opens the
    dialog. Dialog lists all 12 PHB classes — primary always selectable
    (continuation), other classes show their prereq, grey out, and
    show the failing-stat reason when the PC can't meet it. Selecting
    a class dispatches `level_up_class { className }` via the existing
    choice path. 19 FE tests (helper + dialog).
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

- [~] **Spell components.** Verbal + costly material shipped;
      somatic deferred behind a hand-state model that pansori
      doesn't track. Specifically: `Spell.verbal` flag is checked
      against the `deafened` condition in `castSpell/precast.ts`
      (blocks cast). `Spell.materialCost` consumes the listed gp
      cost from `char.gold` on cast (blocks when insufficient).
      Armor proficiency check also gates casting in heavy armor
      without prof. **Deferred — somatic enforcement:** RAW says
      a creature must have a free hand for somatic components
      (War Caster relaxes this). Pansori would need a hand-state
      model — equipped_weapon + equipped_shield = both hands,
      heavy weapons = two-handed grip — to know when somatic is
      blocked. The Spell type doesn't yet carry a `somatic` flag;
      no existing spells are tagged. Mostly a content task once
      the hand model lands. The spellcasting-focus rule (focus
      substitutes for non-costly material) is similarly deferred.
- [x] **Ritual casting** (shipped 2026-05-22). Existing infra in
      `castSpell/precast.ts` was already wired (gates on
      `spell.ritualCasting` + `!combat_active`, skips slot
      consumption); this PR added the user-facing surface and the
      data. New `canRitualCast(char)` helper in `services/multiclass.ts`
      gates on Wizard / Cleric / Druid / Bard. `generateChoices`
      emits a "Cast as ritual (10 min, no slot)" option alongside
      slot-based variants when the spell is ritual-castable, the PC
      is eligible, and combat is off. Three new SRD ritual utilities
      seeded: Detect Magic, Identify (still costs the 100 gp
      material component RAW), Comprehend Languages. All three are
      pure narrative — no mechanical effect beyond the flavour text
      (engine doesn't yet model "you sense magic" / "you understand
      languages" as game-state). Pansori models the 10-minute time
      cost as "out of combat"; no finer-grained time axis. 10 BE
      specs cover choice surfacing per class + combat block + handler
      no-slot-burn + non-ritual-spell rejection + Identify gold
      consumption + insufficient-gold rejection + narrative emission.
- [x] **Long rest 2024 limits** (modelled as "1 per session"). The
      RAW rules are 1/24h, 8h with 6h sleep + 2h light activity,
      and interruption restarts the clock. Pansori has no time-of-
      day axis (no hours/days counter), so the engine substitutes
      "1 per game session" via `state.long_rested` (set true on
      success, blocks subsequent attempts with "You have already
      taken a long rest this session"). This is approximately
      equivalent to RAW for a typical session of play (one
      adventuring day = one session); a multi-day campaign would
      benefit from an explicit day counter that resets the flag.
      Defer the day-counter work until campaigns actually span
      multiple in-fiction days; the current behavior is the
      practical RAW approximation.
- [~] **Lighting tracking** (partial — shipped 2026-05-22 for the
      Stealth/Perception path). `Room.lighting` was previously a
      data field with no engine effect; this PR wires it into the
      sneak + Cunning Action Hide path.

      **Helpers (`rulesEngine.ts`):**
      - `effectiveLightFor(roomLighting, darkvisionFt)` — applies
        darkvision: dark → dim, dim → bright when `darkvisionFt > 0`.
      - `passivePerceptionDcInLight(enemyWisdom, effectiveLight)` —
        bright = base DC; dim = -5 (Disadvantage on sight Perception
        per RAW); dark = 0 (observer effectively Blinded for sight).

      **Engine effect:** the sneak action's group Stealth check
      reads the room's lighting via the observer enemy's effective
      light. Cunning Action Hide uses the same helper for the
      single-PC Stealth roll. Enemies don't yet track darkvision
      (passed as 0), so the observer's effective light matches the
      room's lighting; PC darkvision doesn't change the observer's
      side of the contest.

      **Deferred:**
      - Cell-grained lighting (torchlight cones, darkness spells)
        — pansori's lighting is room-grained.
      - Blinded condition auto-applied in dark rooms — would let
        attack rolls / save rolls etc. inherit the Blinded effects.
        Currently the only Stealth-vs-Perception path uses the
        helper directly.
      - Active Perception (search via interactObject) doesn't yet
        adjust for lighting.
- [x] **Difficult terrain** (shipped pre-session and verified). Cells
      flagged `Room.difficultTerrain` cost 2× movement to enter; per
      RAW the cost doesn't stack with other 2× sources (terrain
      modes). gridMove implements both rules.
- [ ] **Battleaxe mastery: Flex → Topple migration.** Sandbox loot
      data tags Battleaxe with the homebrew `mastery: 'flex'`
      property (lets a versatile weapon roll its two-handed die
      while a shield is equipped). RAW 2024 PHB assigns Battleaxe
      **Topple**. Auditing the other Flex-tagged weapons is also
      due (Longsword is correctly Sap in sandbox, so the picker is
      mixed). Either: update sandbox to RAW masteries and retire
      'flex' entirely, or keep 'flex' as a documented pansori
      variant. Surfaced from a real-game log review on 2026-05-22.
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
- [x] **Initiative ties** (shipped 2026-05-22). `buildInitiativeOrder`
      now sorts by (1) roll total desc, (2) DEX score desc, (3) PCs
      before enemies. Previous implementation just sorted by roll
      and relied on insertion-order + stable sort for the rest
      (the comment promised dex-tiebreak but the code didn't
      implement it). DEX-score tiebreak matches the common house
      rule and the existing comment; PC-first tiebreak matches every
      published adventure module's automated behavior (RAW delegates
      to DM, but the friendly-side-wins convention is universal).
      4 direct tests.

#### Tier 4: out-of-combat systems (lowest urgency)

- [ ] **Downtime activities** — work, training, crafting.
- [ ] **Bastions** (2024 PHB property system).
- [ ] **Crafting** — potions, scrolls, magic items.
- [ ] **Mounted combat.**
- [ ] **Vehicles.**
- [~] **Movement modes** — partial (shipped 2026-05-22 — fly fully
      wired with gameplay impact; climb / swim as data-only grants
      until terrain-mode model lands). New BE-only fields
      `fly_speed_ft`, `swim_speed_ft`, `climb_speed_ft` on Character.
      `gridMove` reads `fly_speed_ft`: when ≥ walking speed, the
      path may bypass obstacle cells (no landing in obstacles) and
      difficult-terrain cost drops from 2× to 1×. Long rest clears
      `fly_speed_ft` defensively; `climb` / `swim` are persistent
      grants from feats / subclasses (don't clear on rest).

      **Wired grants:**
      - Aasimar Celestial Revelation: Radiant Soul variant sets
        `fly_speed_ft = speed`; clears when the 10-round transformation
        timer expires (round-wrap handler in gameEngine.ts).
      - Athlete feat (take-time): grants `climb_speed_ft = speed`.
      - Sea Druid Aquatic Affinity (subclass-select): grants
        `swim_speed_ft = speed`.

      **Terrain-mode model shipped 2026-05-22.** New optional
      `climbTerrain` + `swimTerrain` `GridPos[]` fields on `Room`
      (sibling to `difficultTerrain`). `gridMove` computes the
      per-cell cost: 5 ft base, +5 ft if difficult OR (climbable
      without climb speed) OR (swimmable without swim speed) —
      capped per cell per RAW "multiple sources don't stack".
      Flying still bypasses everything. Budget-exceeded narrative
      surfaces which terrain modes contributed. Authoring content
      (room pool / campaigns) can now flag climb / swim cells; the
      Sea Druid's `swim_speed_ft` and the Athlete feat's
      `climb_speed_ft` finally have real gameplay impact.

      **Remaining for full closure:**
      - Fly spell + Levitate spell — add to SRD catalog so any caster
        can grant flight to a willing creature. Concentration tracking
        clears `fly_speed_ft` on drop.
      - Jumping (long / high) — needs height + horizontal distance
        tracking on the grid; deferred. Different shape from climb/
        swim terrain (a single jump action vs. per-cell cost).
      - Burrowing — monster-only RAW; not on the critical path.
      - Climb / swim authored content — no current room actually
        flags these cells; the engine is ready for content as soon
        as a campaign needs it.

### Subclass coverage (2026-05-22 — all 48 RAW selectable)

> Every 2024 PHB subclass is now a selectable picker entry. The
> table below tracks mechanical-feature completeness per subclass.
> "Selectable + features" means the iconic L3 feature is wired with
> tests. "Picker-only" means selectable but L3 feature is deferred
> (typically because the RAW mechanic needs infrastructure that
> isn't shipped yet).

**Selectable + features (44):**

| Class | Subclass | Headline L3 feature shipped |
|---|---|---|
| Barbarian | Berserker | Frenzy (pre-session) |
| Barbarian | Totem Warrior | Bear/Eagle/Wolf totem with mechanical effects |
| Barbarian | World Tree | Vitality of the Tree (rage temp HP) |
| Barbarian | Zealot | Divine Fury (radiant damage rider) |
| Bard | Lore | Cutting Words (pre-session) |
| Bard | Valor | Extra Attack at L6 |
| Bard | Glamour | Mantle of Inspiration (AoE temp HP) |
| Cleric | Life | Disciple of Life + Preserve Life CD (pre-session) |
| Cleric | War | Guided Strike CD (pre-session) |
| Cleric | Light | Radiance of the Dawn CD |
| Cleric | Trickery | Blessing of the Trickster (Stealth advantage until long rest) |
| Druid | Land | Land's Aid CD (heal/harm) |
| Druid | Moon | Wild Shape Beast Form (pre-session) |
| Druid | Stars | Starry Form — Archer / Chalice / Dragon constellations |
| Fighter | Champion | Improved Crit (pre-session) |
| Fighter | Battle Master | Maneuvers (pre-session) |
| Fighter | Eldritch Knight | Third-caster slots + War Magic L7 |
| Fighter | Psi Warrior | Psionic Strike damage rider |
| Monk | Open Hand | Open Hand Technique (pre-session) |
| Monk | Shadow | Shadow Arts (pre-session) |
| Monk | Mercy | Hand of Healing + Hand of Harm |
| Monk | Elements | Elemental Strikes (fire damage rider) |
| Paladin | Devotion | Sacred Weapon CD (pre-session) |
| Paladin | Vengeance | Vow of Enmity + Abjure Enemy (pre-session) |
| Paladin | Ancients | Nature's Wrath CD (restrain) |
| Paladin | Glory | Inspiring Smite CD (AoE temp HP) |
| Ranger | Hunter | Colossus Slayer (pre-session) |
| Ranger | Beastmaster | Animal Companion (pre-session) |
| Ranger | Fey Wanderer | Dreadful Strikes damage rider |
| Ranger | Gloom Stalker | Dread Ambusher first-attack rider |
| Rogue | Thief | Fast Hands (Utilize → bonus action) |
| Rogue | Assassin | Assassinate auto-crit (pre-session) |
| Rogue | Soulknife | Psychic Blade weapon auto-grant |
| Rogue | Arcane Trickster | Third-caster slots (auto-wired) |
| Sorcerer | Draconic | Draconic Resilience per-level HP |
| Sorcerer | Wild Magic | Wild Magic Surge (pre-session) |
| Sorcerer | Aberrant Mind | Psionic Spells data grant (closest-fit pansori spells) |
| Sorcerer | Clockwork Soul | Bastion of Law (1 SP → 5 temp HP, bonus action) |
| Wizard | Diviner | Portent — d20-interception reaction on enemy hits |
| Warlock | Fiend | Dark One's Blessing (pre-session) |
| Warlock | Archfey | Fey Presence (pre-session) |
| Warlock | Celestial | Healing Light pool |
| Wizard | Abjurer | Arcane Ward (pre-session) |
| Wizard | Evoker | Sculpt Spells (pre-session) |

**Picker-only — features partially / fully deferred (4):**

| Class | Subclass | What's deferred |
|---|---|---|
| Bard | Dance | Bardic Inspiration die variants (damage/AC/move) |
| Cleric | Trickery | Invoke Duplicity (Blessing of the Trickster shipped) |
| Druid | Sea | Wrath of the Sea (push on cantrip hit) |
| Sorcerer | Clockwork Soul | Restore Balance reaction (Bastion of Law shipped) |
| Warlock | Great Old One | Awakened Mind telepathy |
| Wizard | Illusionist | Improved Minor Illusion, Malleable Illusions |

**Reaction-window infrastructure (new — 2026-05-22):** Generic
`PendingD20InterceptionReaction` shape in the PendingReaction union,
with a `source: 'portent'` discriminator that's intentionally open so
follow-up users (Lucky's RAW spend-after-roll timing, Clockwork Soul's
Restore Balance reaction) can plug in by registering a new source +
resolver branch. Today the trigger point is wired only at enemy attack
rolls inside `runEnemyMultiattackLoop` (mirrors Silvery Barbs); PC-turn
d20 sites (PC's own attacks, saves, ability checks) don't yet emit the
reaction window because pansori's PC-turn execution doesn't have a
pause/resume contract. The remaining picker-only subclasses needing
this infrastructure are now scoped to "extend the existing window to
new trigger points" rather than "build it from scratch".

Most deferred features need a specific surface that pansori
doesn't have yet (reaction-window for d20 interception, full
movement-mode model, multi-target Wild Shape variants). Each can
ship in a follow-up PR when a campaign needs the feature or when
the prerequisite infrastructure lands.

**Species additions (related work this session):**
- [x] **Aasimar species** (shipped 2026-05-22). Necrotic + radiant
      resistance, darkvision 60 ft, Light cantrip auto-prep.
      Added to `SRD_SPECIES` in srd/species.ts.
- [x] **Healing Hands** (Aasimar 1/long rest). New
      `use_healing_hands` action; rolls prof-bonus d4s. Long-rest
      reset wired.
- [x] **Celestial Revelation** (Aasimar L3+). New
      `use_celestial_revelation { variant }` action with 3 sub-
      options (Necrotic Shroud / Radiant Soul / Radiant
      Consumption). Bonus action, 1/long rest, 10-round
      transformation. Per-variant +prof melee damage rider
      (necrotic for Shroud, radiant for the others). Round-tick
      duration via `class_resource_uses.celestial_revelation_rounds`.
      Deferred: flight speed (Radiant Soul), 10-ft aura damage
      (Radiant Consumption).

### Spells (2026-05-22 — catalog expanded, infrastructure built)

> The 30-spell SRD catalog grew by 14 spells across the May 2026
> session. Two infrastructure pieces shipped that unlock further
> additions.

**Infrastructure shipped:**
- [x] **Buff-spell path** (2026-05-22). `castSpell.ts` runs a new
      branch BEFORE the offensive-spell "needs an enemy" gate.
      Spells with `targetType: 'self' | 'ally' | 'self_or_ally'`
      route here. Applies condition (if any) + temp HP grant + max
      HP bonus to caster or chosen party member; sets concentration
      if applicable. Greater Invisibility break-on-attack carve-out
      so magical invisibility persists through attacks.
- [x] **AC pipeline** (2026-05-22). `computeTotalAc` now accepts
      `mageArmorActive` + `shieldOfFaithActive` flags. Two new
      Character fields. `breakConcentration` sweeps SoF flags on
      concentration drop. Long rest clears both + recomputes AC.

**New spells (14 added this session):**
- L1: Lightning Bolt is L3 below, Faerie Fire (advantage on
  attacks vs outlined creatures), Mage Armor (+3 AC unarmored),
  Shield of Faith (+2 AC concentration), Heroism (3 temp HP +
  concentration).
- L2: Web (restrained AoE cube), Suggestion (charmed
  concentration), Aid (+5 max HP, upcast scales).
- L3: Lightning Bolt (8d6 lightning line), Stinking Cloud
  (poisoned AoE sphere).
- L4: Wall of Fire (5d8 fire line, concentration), Greater
  Invisibility (invisible + concentration, attacks don't break).
- L5: Cone of Cold (8d8 cold cone), Hold Monster (paralyzed any
  creature, concentration).

**Spells still missing (data + complexity notes):**
- ~~**Mass Healing Word / Mass Cure Wounds**~~ — shipped
  2026-05-22. New mass-heal path in `castSpell/heal.ts` checks the
  spell id and distributes the rolled heal across all living party
  members (Disciple of Life + Chalice bonus apply per-target).
- ~~**Fly / Levitate**~~ — shipped 2026-05-22. Buff-shaped spells
  (`targetType: 'self_or_ally'`) set `fly_speed_ft` on the target
  via the buff path; concentration drop sweeps the flag in
  `breakConcentration`. Fly = 60 ft, Levitate = 20 ft (RAW
  vertical-only modeled as a limited flying speed).
- ~~**Detect Magic / Identify / Comprehend Languages**~~ — shipped
  with ritual casting.
- ~~**Slow (L3)**~~ — shipped 2026-05-22. WIS save, concentration.
  Single-target via the existing save+condition path (RAW multi-
  target via 40-ft cube deferred). New `slowed` condition + engine
  effects: `effectiveSpeed` halves the value, `effectiveEnemyAc` in
  resolveOneAttack subtracts 2 from the target's AC, and
  `rollConditionSave` subtracts 2 from Dex saves on slowed targets.
  Renamed the prior narrative-only `slowed` weapon-mastery condition
  to `slow_struck` to free the canonical name for the spell. The
  RAW action-economy gate (action OR bonus action, one attack max),
  no reactions, and 25% somatic-spell fail are all deferred behind
  the same turn-flow rework Haste's extra-action needs. The end-of-
  turn save to throw off the effect is also deferred. 6 BE specs.
- ~~**Heal (L6)**~~ — shipped 2026-05-22. 70 HP + WIS mod, +10 per
  slot above 6th. Uses the existing heal pipeline. Required an
  `addDice` / `multiplyDice` fix to handle plain-numeric heal
  expressions ('70' + '10' was being concatenated as '70+10' which
  rollDice parsed as just 70). Condition removal (Blinded /
  Deafened / Poisoned per SRD: "This spell also ends the Blinded,
  Deafened, and Poisoned conditions on the target.") shipped via
  new `Spell.removeConditions` field that the heal branch reads +
  strips after the HP restore. Future spells (Greater Restoration,
  Lesser Restoration, etc.) plug into the same field.
- ~~**Haste (L3)**~~ — shipped 2026-05-22. Buff path
  (targetType: 'self_or_ally'), concentration. Applies the new
  `hasted` condition. effectiveSpeed doubles when hasted; the new
  `hastedActive` flag on computeTotalAc adds +2 AC (wired in the
  buff-path AC-recompute alongside Mage Armor / Shield of Faith);
  rollConditionSave grants advantage on Dex saves when 'hasted' is
  in targetConditions. Concentration drop in breakConcentration
  strips hasted, applies incapacitated for 1 round (the RAW
  "lethargy"), and recomputes AC. The extra-action mechanic (RAW
  "additional action each turn limited to Attack-one / Dash /
  Disengage / Hide / Utilize") is deferred behind a turn-flow
  refactor that would let a PC take a second action without ending
  their turn. The speed-0 detail of the lethargy isn't separately
  enforced (incapacitated already gates actions; pansori MVP).
- ~~**Polymorph**~~ — shipped 2026-05-22 using the 2024 PHB rewrite
  (form HP lives on temp HP instead of swapping primary HP). L4
  transmutation, WIS save. New `polymorph_state: { formName }` field
  on `CombatEntity` marks the entity as polymorphed; the form's HP
  pool lives on `entity.temp_hp` (also new on CombatEntity — enemies
  didn't track temp HP before). Pansori MVP auto-picks Wolf (11 HP)
  regardless of target CR.

  **Damage flow**: resolveOneAttack absorbs damage into temp_hp first,
  excess to hp. When temp_hp depletes to 0, the polymorph form drops
  automatically: condition cleared, polymorph_state cleared, temp_hp
  cleared. Excess damage carries over to hp (RAW). This matches the
  2024 PHB rewrite that uses TemporaryHitPoints instead of a separate
  buffer — the heal exploit (2014: healing spells could restore form
  HP because it was real HP) is structurally blocked since healing
  doesn't restore temp HP.

  **Enemy turn**: polymorphed entities skip their turn entirely (RAW:
  they'd use the beast's actions, but pansori would need the
  computeEnemyAttack pipeline to substitute attack profiles — deferred).

  **Revert paths**:
  - Form-drops-to-0 (temp_hp depleted): condition + state cleared, hp
    takes the spillover. Caster's concentration is NOT explicitly
    cleared in pansori MVP — they can keep "concentrating" on a
    non-existent target (no-op, harmless drift).
  - Concentration drop: breakConcentration sweeps every polymorphed
    entity and clears the state + condition + temp_hp.

  5 BE specs: failed save grants temp_hp + condition; success resists;
  temp_hp absorbs damage with spillover form-drop; concentration drop
  reverts.
- ~~**Banishment**~~ — shipped 2026-05-22. New `banished` condition
  in the registry (duration: permanent — concentration is the actual
  timer). Banishment spell (L4 abjuration, CHA save, concentration)
  uses the existing save+condition pipeline to apply it. Enemy
  turn loop skips banished entities (same shape as the surprised
  check). Player attack-target filter excludes banished enemies
  from `livingEnemies` + `livingEnemiesInRoom`. Concentration
  drop via `breakConcentration` strips the linked condition,
  returning the enemy. RAW upcast (+1 target per slot above 4th)
  deferred — pansori MVP hits one target via the save branch.
- ~~**Dimension Door**~~ — shipped 2026-05-22. L4 conjuration. Real
  grid teleport for the caster (RAW also lets you bring one willing
  creature within 5 ft — deferred). New branch in `castSpell/utility.ts`
  auto-picks the cell with maximum min-distance to any living enemy
  (pansori MVP — no FE picker yet for destination cells). Movement
  budget for the turn isn't consumed (RAW: teleport doesn't use
  movement). Falls back to narrative-only when the grid is empty
  (out-of-combat). Misty Step stays narrative-only for now —
  could share the same teleport branch if/when a Misty Step FE
  destination picker lands.
- **Counterspell** — already shipped pre-session.
- **Spirit Guardians** — already shipped pre-session.

**Tier C closure note (2026-05-22):** The architectural / new-pattern
work in Tier C is done — every "different shape" spell that pansori
needed reusable infrastructure for has shipped (multi-target heal,
buff temp-HP, save-with-condition-revert, target-removed-from-combat,
stat-block swap via temp HP, real grid teleport, multi-stat buff,
multi-stat debuff). The remaining content (more spells, more monsters,
more backgrounds, magic items, epic boon feats, higher-level subclass
features) is repeatable data churn — each future addition slots into
an existing pattern. Ship as campaigns / playtests demand them, not
as a critical-path engine block.

**Spells deferred behind specific infra:**
- **Wall of Force / Wall of Fire (real grid blocker)** — needs
  transient grid obstacles that expire on concentration drop.
- ~~**PC-turn d20 reaction window**~~ — architecture shipped
  2026-05-22. New `PendingPcD20Reaction` variant on the
  PendingReaction union (distinct from PendingReactionBase — carries
  `rollerCharId` instead of `attackerEnemyId/targetCharId`).
  resolvePlayerAttack gained a `forceRoll1` parameter that bypasses
  internal d20 generation; AttackContext gained `forceD20` that
  resolveOneAttack passes through. attack/index.ts now stashes a
  pre-attack snapshot + proposed (miss) snapshot + the AttackContext
  blob when a PC misses + has Heroic Inspiration (not pre-declared),
  and pauses. The resolve_reaction handler's new pc_d20 branch
  rewinds to the pre-attack state on accept, rolls a new d20,
  clears inspiration, and re-calls resolveOneAttack with forceD20
  set. On decline, commits the proposed miss snapshot and retains
  Inspiration.

  First wiring: **Heroic Inspiration on missed attacks** (SRD:
  "expend it to reroll any die immediately after rolling it, and
  you must use the new roll"). Pansori MVP triggers only on attack
  misses (RAW also allows rerolling hits for crit chasing — deferred
  for UX); only on the first attack of a multi-attack sequence
  (Extra Attack iterations don't pause); only on attack rolls (saves
  + ability checks deferred to follow-ups). The pre-declared
  `spend_inspiration` path remains for legacy / immediate-advantage
  use; players can also wait and use the post-roll reaction. 7 BE
  specs cover pause, no-pause, choice surfacing, accept-to-hit,
  accept-still-miss, decline. The `inspiration_pending` flag check
  in attack/index.ts gates the post-roll surfacing so the two paths
  don't double-fire.

  Future plug-ins on the same shape (each is its own PR's worth):
    - **Lucky feat (PHB-only)** — same pause point on attacks; also
      pauses on PC saves + ability checks.
    - **Clockwork Soul Restore Balance** — different pause point
      (pre-roll, cancels adv/disadv).
    - **Mirror Image, Counterspell-on-self, Foresight** — each
      hooks one specific d20 site.
- **Mirror Image / Counterspell-on-self / Foresight** — each is a
  d20 reaction now that the window infra exists; ship as needed.
- **Bestow Curse / Hold Monster variants** — need multi-option
  picker UX on the FE for the curse type selection.
- **Revivify / Raise Dead** — need a death + return-to-life
  pipeline (currently dead PCs stay dead until manual revive).
- **Haste + Slow extra-action / cap-action gates** — need the
  PC-turn extra-action flow (let a hasted PC take a second
  limited action; cap a slowed PC at action OR bonus, etc.).
- **Heroes' Feast / Greater Restoration** — pluggable via the
  existing `removeConditions` + multi-target heal infra.

### Architectural blockers

- [x] **Climbing movement cost** — shipped 2026-05-22 via the
      terrain-mode model. Cells flagged `climbTerrain` cost 2× per
      cell without a climb speed, 1× with `climb_speed_ft > 0`.
      Crawling cost (half-speed prone movement) is separate and
      not modeled — RAW says prone halves movement, which the
      engine could surface as a movement_used multiplier on the
      whole turn when the prone condition is set. Defer.
- [ ] **Jumping** — Long jump = STR ft, high jump = 3 + STR mod ft.
      Different shape from per-cell terrain cost (one-shot horizontal
      or vertical action). Defer.

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
- [x] **gameEngine.ts action-handler refactor** (fully shipped 2026-05-22 with the resolveOneAttack + castSpell internal splits) — 29 PRs across one session decomposed `takeAction`'s inline switch into per-action handler files under `services/actions/`. `gameEngine.ts` shrank 10,052 → 4,704 lines (-53%). All 38 action types dispatch through `services/actions/index.ts` against an `ActionContext` object; the inline switch is empty (just the default unknown-action fallback). `classFeature.ts` (the largest single case at 1,712 lines) fully decomposed by class into `classFeature/{barbarian,fighter,rogue,monk,druid,casters,cleric,paladinRangerBard,species,index}.ts`. `attack.ts` partially split (preattack/combatStart/toHit extracted; resolveOneAttack closure remains inline at ~615 lines). `castSpell.ts` (~840 lines) lifted but not internally split yet. Architectural addition: **transformer pattern** (`replaceWith` / `delegateTo` on handler return) for actions that yield to a different action — used by `attack_npc` and `use_reaction`; ready for future 5.5e features like Eldritch Strike, Counterspell, War Caster, Beast Form attack overrides. **What remains**:
  - [x] **`resolveOneAttack` extraction from `attack/index.ts`** (shipped 2026-05-22). New `attack/resolveOneAttack.ts` carries the top-level `resolveOneAttack(ctx, atkCtx, label)` function + an `AttackContext` interface that bundles the closure's previously-captured state (target / targetId / weaponItem / weaponDamage / isVersatile / weaponLabel + the full ToHitContext). `attack/index.ts` shrank 977 → 100 lines; the handler now constructs the AttackContext once after the to-hit phase and calls `resolveOneAttack` for the first attack + each Extra Attack iteration. Adv/disadv state stays stable across the loop (computed once, read N times). Behavior unchanged — all 1016 BE tests pass.
  - [x] **`castSpell.ts` internal split** (shipped 2026-05-22). Decomposed into `services/actions/castSpell/`: `index.ts` (orchestrator, 184 lines), `precast.ts` (gates + slot + action-economy + casting ability + Wild Magic Surge + EK War Magic, 291 lines), `heal.ts`, `buff.ts` (self/ally/self_or_ally + Mage Armor + Shield of Faith), `utility.ts` (narrative + Bless), `multiTarget.ts` (Magic Missile / Eldritch Blast), `attackRoll.ts`, `save.ts` (with embedded condition + kill resolution), `autoHit.ts`, `aoe.ts` (sphere/cone/cube/line), `applyDamage.ts` (post-resistance multiplier + kill resolution), `utils.ts` (pickCastPrefix + concentrationRoundsFor). Behavior unchanged — all 1016 BE tests pass. The narrativePlaceholders lint was updated to recurse into action subdirectories (attack/, castSpell/, classFeature/) so the placeholder check picks up the per-phase split files.
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
  - [x] **2026-05-22 combat bug sweep.** Twelve bugs caught during
    the gap-list/subclass implementation work, each shipped with a
    regression spec:
    1. `rangedInMelee` now requires an enemy WITHIN 5 ft of attacker
       (was firing on any enemy in the room).
    2. `armorItem` lookup in `computeEnemyAttack` corrected.
    3. Death save no longer phantom-applies 2 failures on the PC's
       own turn (the multi-attack-prone trigger was conflated with
       the PC's death-save action).
    4. Resilient feat's save proficiency now honored by
       `conditionSavingThrow` (the save path read class-grant prof
       only, not feat-grant).
    5. OA damage in `gridMove.ts` now routes through `applyDamage`
       (was bypassing temp HP / exhaustion clamp / concentration).
    6. Unconscious condition now cleared on heal-from-0 HP (was
       leaving PCs "alive but unconscious").
    7. Sneak Attack now scales correctly + triggers for multiclass
       Rogues (was reading the primary-class level only).
    8. Extra Attack now scales correctly across multiclass
       (Fighter 5 / Rogue 2 → 1 extra; was 0).
    9. Sneak Attack now gates once-per-turn (was firing on every
       hit during Extra Attack / TWF sequences).
    10. Cleave (Greatsword mastery) damage now routes through
        `applyDamageMultiplier` (was bypassing
        resistance/vulnerability).
    11. Heal-spell upcast now scales heal dice with slot level (was
        consuming the upcast slot but only rolling base dice).
    12. Heal narrative now reports the actual amount restored
        post-cap (was reporting the raw rolled value — "restores
        13 HP to Fighter (now 8/8)" type display bug).

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
  - [~] **4C.3. Class-feature handler migration** (shipped 2026-05-22,
        partial). New `SaveFragment` kind in
        `services/narrative/fragments.ts` carries the full save outcome
        (roll, DC, success, source) + the prose the composer should
        append. `renderSave` in compose.ts emits a `kind: 'save'`
        CombatEvent. Three handlers migrated from bare-`pushEvent` to
        the fragment: Monk Stunning Strike (CON), Fighter Maneuver
        Goading Attack (WIS), Paladin Abjure Enemy (WIS). All three
        pair a save fragment with a follow-up condition_applied
        fragment when the save fails. 2 added composer tests cover
        the save fragment in success + failure shapes.

        **Remaining sites that still call `pushEvent({kind:'save'})`:**
        - ~~`monk.ts` Open Hand Technique DEX save~~ — migrated
          2026-05-22 via composeNow + empty prose (consolidated
          flurry narrative still owns the player-facing line).
        - ~~`cleric.ts` Turn Undead / Sear Undead~~ — migrated
          2026-05-22, same pattern: per-target SaveFragment with
          prose='' adds combat-log entries for every save; the
          consolidated lines[] narrative is unchanged.
        - ~~`casters.ts` Fey Presence~~ — migrated 2026-05-22, same
          pattern as the Cleric AoEs.
        - Damage-only paths (Divine Smite, Flurry-of-Blows hit) emit
          their notes via `bonuses[]` on the existing attack fragment;
          already migrated as of the original 4C.1.
        - **Still inline (single-target attack-hit event):**
          `cleric.ts` Divine Spark (~ line 59) emits a custom
          `attack_hit` CombatEvent with `toHit: 0` — auto-hit spell
          damage. Could migrate to a `spell_auto_hit` fragment but
          that changes the prose format. Defer until a Divine Spark
          rework is on the docket.
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

  **Phase 2 pilot shipped 2026-05-22.** `handleDodge` migrated to
  read + write through `ctx.actor` (narrowed to PC) via a new
  `updatePcActor(ctx, patch)` helper in `services/actions/actor.ts`
  that keeps `ctx.char` and `ctx.actor.char` in lockstep across
  reassignments. Documented inline as the canonical migration
  pattern future handlers should follow. 3 added helper tests.

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
