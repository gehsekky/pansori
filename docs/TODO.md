# TODO

> **Status snapshot — verified 2026-05-26.** The top section is the
> authoritative implementation status, re-grounded in a fresh code survey
> (not the prior changelog). The backlog below it lists only remaining
> work. Shipped-feature completion logs were removed — `git log` is the
> record of what already landed.

## End-goal target

Browser-based, D&D 5e **SRD 5.2.1**-compliant engine capable of running
complex campaign scripts as a full RPG experience. Strict SRD-only — no
PHB/DMG-exclusive content (subclasses, feats, species, spells). See
[CLAUDE.md](../CLAUDE.md) for the contribution rule and
[LEGAL.md](../LEGAL.md) for the SRD attribution + scope statement.

---

## Implementation status (code-verified 2026-05-26)

Grounded in a code survey + the full backend suite: **1883 tests across
218 files, all green** (lint + typecheck clean).

### Done — rules-engine frameworks

- **Attack / damage pipeline** — to-hit, advantage/disadvantage stacking,
  crits, resistance/vulnerability/immunity multipliers, dual-damage spells,
  massive-damage instant death.
- **Tactical grid combat** — BFS pathfinding, opportunity attacks (reach
  override), cover, flanking (optional), difficult terrain, Chebyshev
  distance; line-of-sight blocking by wall obstacles (ranged + offensive
  spell targeting).
- **Conditions** with source attribution; **concentration** (saves +
  break sweep); **spell slots / components / AoE shapes / saves**;
  **reactions** (Shield, Counterspell, Hellish Rebuke, Uncanny Dodge,
  readied actions, OAs, Heroic-Inspiration reroll window — discriminated
  `pending_reaction` with pause/resume); **rest / death-save / revive
  ladder**; **weapon masteries** (8 SRD + the `flex` variant).
- **Dispatcher-integrated enemy turns** — a whole enemy turn runs as
  `enemy_move` → (`enemy_cast` | `enemy_attack`×N) through the same
  `dispatchAction` path as PC actions, via an `enemyActor`. PC vs monster
  attack/spell _resolvers_ stay deliberately distinct; the dispatch
  _entry_ is unified so shared abilities hook in from one place.
- **Summon-as-ally infrastructure** — `side` tagging, the ally turn AI
  (`runAllyTurn`), summon lifecycle, and the combat-start bridge
  (`seedSummonedAllies`). **Animate Dead** is content-complete (Skeleton/
  Zombie variants, upcast multi-raise, bonus-action `command_summon`).

### Done — character build

- **All 12 classes + their iconic SRD subclass, implemented through L20.**
  Full feature kits per class, each spec-covered. Subclasses: Berserker,
  College of Lore, Life Domain, Circle of the Land, Champion, Open Hand,
  Oath of Devotion, Hunter, Thief, Draconic Sorcery, Fiend, Evoker.
- **9 SRD species** with mechanical traits; **6 origin feats** + **7 SRD
  epic boons** (backend-wired); **4 SRD fighting styles** (Archery,
  Defense, Great Weapon, Two-Weapon).
- **Multiclassing** — per-class levels, multiclass spell-slot table,
  ability prerequisites, proficiency grants on entry, per-class feature
  gating.
- **2024 exhaustion** (−2/level to d20 tests, −5 ft/level speed, lethal at
  6); **ability-score generation** validation (point buy / standard array,
  backend) + background ASIs applied; **skill→ability map** with all
  contested/social checks routed through `skillCheck`.

### Content counts (the breadth that remains)

| Category                  | In pansori                                       | SRD universe                     |
| ------------------------- | ------------------------------------------------ | -------------------------------- |
| Spells                    | **212** (26 cantrips + 186 leveled, through L9)  | ~330                             |
| Shared SRD monster pool   | **31** (`SRD_MONSTERS`) + per-campaign templates | hundreds                         |
| Species                   | 9                                                | 9 standalone + Drow lineage      |
| Classes                   | 12                                               | 12                               |
| Subclasses                | 12 iconic (1 / class)                            | 1 iconic / class in SRD          |
| Origin feats / epic boons | 6 / 7                                            | 4 (+Magic Initiate variants) / 7 |

**Bottom line:** the rules-engine frameworks and the entire class/subclass
progression are done. What remains is overwhelmingly **content breadth**
on existing patterns, **frontend creation/choice surfaces** that finished
backend features are waiting on, and a handful of **bounded subsystems**.

---

## Remaining work

### Content breadth — data on existing patterns (RE-6)

- [ ] **Spells** — ~212 / ~330 SRD. Most remaining categories are already
      representable (data entry). Latest batch (`spellsBatch6.spec.ts`): **Blade
      Barrier** + **Wind Wall** (save-for-half wall AoEs, data-only), **Ray of
      Sickness** (attack-roll poison ray — generalized `runAttackRollSpell` to
      stamp an on-hit `condition`, honoring condition immunities), **Protection
      from Energy** (resistance buff with a new `resistType` element picker
      wired through buff.ts), and **Gentle Repose** (narrative ritual). Data-only
      batch (`rawSpellsBatch.spec.ts`):
      Dissonant Whispers, Mind Spike, Vitriolic Sphere, Freezing Sphere
      (save-for-half damage), Charm Monster (WIS save → charmed, save
      Advantage), Protection from Poison (touch ward: strip Poisoned + poison
      Resistance). Later batch (`spellsBatch5.spec.ts`): **Blur** (self buff →
      new `blurred` condition: attackers roll at Disadvantage, like Invisible),
      **Incendiary Cloud** + **Sunbeam** (AoE save-for-half damage, mirroring
      Cloudkill / Lightning Bolt; per-turn re-damage + Sunbeam's Blinded rider
      deferred), and six narrative-utility spells (Commune with Nature, Find the
      Path, Legend Lore, Meld into Stone, Animal Messenger, Tiny Hut).
  - [x] **Timed enemy conditions** — shipped (`timedEnemyConditions.spec.ts`).
        Enemies had no per-turn condition tick (the PC analogue runs at each
        PC's turn start), so finite enemy conditions never expired. Added
        `tickEnemyConditions` (round-wrap decrement + expiry, mirroring the
        zone / concentration ticks) and cast-time stamping of
        `spell.conditionDuration` onto enemies in the single-target save path +
        the AoE-condition path — guarded to non-concentration spells and
        skipping the turn-loop-managed control conditions
        (`TURN_LOOP_MANAGED_CONDITIONS` = commanded/confused/compelled/
        dominated). This makes Charm Person/Monster + Blindness/Deafness expire
        RAW. **Blinded** is now mechanically live: attacks vs a Blinded enemy
        roll with Advantage (`toHit`), and a Blinded enemy's own attacks roll
        with Disadvantage (`computeEnemyAttack`) — which also activates Rogue
        Cunning Strike: Obscure (now stamps a 1-round blind). **Color Spray**
        (L1, 15-ft cone, CON save → Blinded until end of your next turn) ships
        on it; `runAoeConditionSpell` is now cone/cube/line-aware (reuses the
        AoE damage branch's shape helpers). The blinded enemy's own-disadvantage
        was later generalized to the full `DISADV_CONDITIONS` set
        (frightened/poisoned/restrained/prone) — see the condition-fidelity pass.
  - [x] **Enemy charm / fear AI** — shipped (`charmFearAI.spec.ts`). The
        conditions previously applied + expired but didn't change enemy
        behavior. Now the cast paths record the source on the enemy entity
        (`charmer_id` / `frightened_by`). A **Charmed** enemy can't attack its
        charmer — `selectTarget` drops the charmer from its candidates (turns on
        another PC, or stands down if the charmer is the only target). A
        **Frightened** enemy attacks with Disadvantage (`computeEnemyAttack`,
        LoS approximated as always-in-sight) and can't advance on its fear
        source (`attemptEnemyApproach` zeroes its Speed toward `frightened_by`,
        like the grappled/restrained hold). Makes Charm Person/Monster + Fear
        mechanically real. Deferred: Charm Monster's full "Friendly to you"
        (only the no-attack-charmer half is modeled); a Frightened creature may
        still advance on a non-source PC (the geometric "no closer to the
        source" rule is simplified to "held when targeting the source").
  - [x] **End-of-turn "save ends" hook + incapacitation skip** — shipped
        (`saveEndsConditions.spec.ts`). `CombatEntity.save_ends` maps a condition
        to its recurring save `{ ability, dc }`; the enemy turn loop evaluates it
        at turn start (gated by `save_ends_acted` so the effect lasts ≥1 turn,
        mirroring `confused_acted`) and clears the condition on a success. A new
        flag `Spell.conditionSaveEnds` stamps it from the save / AoE-condition
        cast paths. Companion fix: **incapacitating conditions (stunned /
        paralyzed / incapacitated / unconscious / petrified) now make an enemy
        skip its turn** — a real pre-existing gap (a paralyzed enemy used to act
        normally), so Hold Person/Monster, Sleep, and Stunning Strike all gained
        teeth too. **Power Word Stun** (L8: ≤150 HP → Stunned w/ CON save-ends; >150 HP → Speed-0 narrated) and **Slow** (WIS save-ends added) ride the
        hook. Deferred: the >150-HP Power Word Stun Speed-0 branch is narrated
        (no per-enemy speed-0-until-X primitive).
  - [x] **Per-attack weapon riders** — shipped (`weaponRiderSpells.spec.ts`).
        New `Spell.weaponRider` + `Character.weapon_rider` (persistent) /
        `pending_smite` (one-shot), set by the buff cast path and read in
        `resolveOneAttack` (riding on top of the weapon multiplier like the
        radiant Smite riders). **Divine Favor** (+1d4 radiant on every weapon
        hit, 1 min, non-concentration) rides `weapon_rider`; the smites arm the
        next melee hit via `pending_smite`: **Searing Smite** (+1d6 fire),
        **Shining Smite** (+2d6 radiant + `faerie_fired` so attacks vs the
        target gain Advantage — reuses the timed-condition cap), **Ensnaring
        Strike** (STR save → Restrained, riding the save-ends hook). Teardown:
        breakConcentration (concentration smites) + endCombatState (the
        non-concentration riders). Deferred: Searing's per-turn fire DoT and
        Ensnaring's per-turn piercing DoT are narrated, not ticked; smites are
        melee-only (Ensnaring's RAW any-weapon is simplified).
  - [ ] Remaining engine-gated spells: Ray of Sickness (attack-roll + condition
        rider), Sorcerous Burst (per-cast damage-type pick).
  - [~] **Forced displacement** — shipped (RE-4): the `pushFt` spell flag +
    `pushEntityAway` (pushes a creature directly away from the caster up to
    the distance, pathed via `planEnemyApproach` toward the away-edge so it
    stops at grid edges / blockers), wired into the AoE save path after
    damage on a failed save. **Thunderwave** (now a proper 15-ft cube: 2d8
    thunder + push 10 ft) and **Gust of Wind** (60-ft line, STR save, push
    15 ft, no damage) ride it. Deferred: Gust's per-turn re-push for
    creatures ending their turn in the line + its toward-caster movement
    tax (on-cast push only; concentration flag is honored).
  - [~] **Persistent damage zones** — foundation shipped (RE-4): `GameState.spell_zones` + `SpellZone`, the `persistentZone` spell flag, cast-time `runZoneSpell`
    (stamp + concentration link + tick-on-cast), the round-wrap tick
    (`fireSpellZones` → `applyZoneTick`, save-for-half or auto), and
    concentration cleanup. **Moonbeam** + **Flaming Sphere** ship on it.
    **Spirit Guardians** rides this as a caster-following aura
    (`followsCaster` — footprint recomputed from the caster's cell each
    tick); **Call Lightning** (DEX-save bolt) and **Spike Growth** (the
    first no-save zone) ship as placed zones. Placed zones are
    **repositionable** via the `move_zone` action (`zoneMoveFt` +
    `zoneMoveCost`): Flaming Sphere rolls 30 ft as a Bonus Action, Moonbeam
    (60 ft) and Call Lightning (120 ft) re-aim as a Magic action; the move
    recomputes the footprint and ticks at the new spot. Remaining: Spike
    Growth's per-5-ft-moved damage + difficult terrain are approximated as
    a flat per-round tick.
  - [~] **Recurring spell attacks** — shipped (RE-4): `Character.recurring_attack` + the `recurring_spell_attack` action, `resolveRecurringAttack` (spell
    attack vs AC → damage + optional heal), cast-time setup
    (`runRecurringAttackSpell`), round-wrap expiry + concentration cleanup.
    **Spiritual Weapon** (Bonus-Action force attack, +spellcasting mod, no
    concentration) and **Vampiric Touch** (Magic-action necrotic that heals
    half, concentration) ride it.
  - [~] **Enchantment control** — shipped (RE-4): the `commanded` + `confused`
    conditions, an enemy-turn skip/behavior block, and an opt-in
    **AoE-condition-to-all** cast path (`aoeCondition` → `runAoeConditionSpell`,
    applies a condition to every failed-save hostile in the blast +
    stamps the save DC on the concentration link). **Command** (L1, WIS
    save → "Halt": lose your next turn, one-shot) and **Confusion** (L4,
    10-ft sphere, WIS save → `confused`; each turn the creature re-saves,
    then 1d10: 1-6 waste the turn, 7-8 attack a random creature in reach —
    ally, summon, OR a nearby PC (RAW; PC hits route through `applyDamage`
    so they trigger the victim's concentration save / knockout), 9-10 act
    normally) ride it. Confusion's re-save is RAW-faithful: a creature
    stays confused for at least its first full turn (`CombatEntity.confused_acted`
    gates the end-of-turn save, evaluated at the start of each subsequent
    turn). **Compulsion** (L4, 30-ft sphere, WIS save → `compelled`: each
    turn the creature staggers its full movement away from the caster — no
    action — then re-saves) and **Dominate Beast/Person/Monster** (L4/L5/L8,
    WIS save rolled with Advantage via `Spell.saveAdvantage` → `dominated`:
    on its turn the creature attacks the nearest OTHER enemy, fighting for
    the party; taking damage triggers an on-damage re-save via
    `dominatedDamageReSave`, hooked into the spell/AoE/weapon damage paths)
    round out the family. The four control conditions
    (`commanded`/`confused`/`compelled`/`dominated`) all resolve in the
    enemy turn loop's behavior block and clear via breakConcentration; the
    forced-move + dominated-attack paths reuse `planEnemyApproach` /
    `resolveEnemyAttack` / `applyDamageToEntity`. Simplifications: Command's
    upcast (+1 target/slot) and command words collapse to "Halt"; Confusion's
    fixed radius (no upcast widening); Compulsion's direction is fixed
    to "away from caster" and auto-applies (no per-turn Bonus Action);
    Dominate defers only the manual command surface (auto-pilots the
    creature) and a dominated foe still counts as an enemy for room-clear.
    The Dominate on-damage re-save uses the caster's stamped spell save DC
    (`save_dc` recorded on the concentration link by both the AoE-condition
    and single-target save cast paths) and fires on party spell / AoE /
    weapon damage AND on Confusion friendly fire; only enemy-caster AoE
    onto a dominated creature is still un-hooked. Note: older AoE-condition
    spells (Hypnotic Pattern, Web) still condition only the primary target
    until migrated onto `aoeCondition`.
    Exceptions still needing a model first: the alternate "summon" spells,
    each mechanically distinct from the stat-block ally model —
  - [ ] **Conjure Animals** (L3) + other 2024 conjure spells — a
        concentration _damage zone_ (DEX save, scaling dice); closer to a
        moving AoE/hazard than a summoned creature.
  - [ ] **Find Familiar** — a non-combatant utility companion (can't take
        the Attack action RAW); a scouting/aid model, not the ally-turn AI.
- [~] **Monsters** — stat-block content. The shared pool grew 12 → 31
  (`monsters.spec.ts`): a CR 1/8–3 spread of SRD 5.2.1 bestiary entries
  (kobold, guard, cultist, giant rat, zombie, scout, worg, gnoll, black
  bear, dire wolf, specter, animated armor, bandit captain, berserker,
  ghast, griffon, owlbear, manticore, wight) using the supported fields
  (multiattack, onHitEffect, resistances/immunities/condition-immunities,
  speedFt). Three ability hooks then shipped (`monsterAbilities.spec.ts`),
  all in `computeEnemyAttack`: **Pack Tactics** (`packTactics` — Advantage when
  an ally is within 5 ft of the target; wolf/kobold/giant rat/worg/dire wolf),
  **Bloodied Frenzy** (`bloodiedFrenzy` — Advantage while the attacker is ≤ ½
  HP; berserker), and **bonus on-hit damage** (`bonusDamage`/`bonusDamageType`,
  halved if the target resists the bonus type — ghast/wight necrotic, cultist
  ritual sickle). Several per-monster specials still need new infrastructure —
  tracked in **Monster-ability infrastructure** below. Legendary + lair
  scaffolding is shipped (`legendary_actions` pool; `lair_actions` round-wrap
  AoE) but not wired to a current boss. Other effects shipped: `extra_attack`,
  `aoe_save_damage`. Remaining: more breadth + the infra gaps below.
- [ ] **Magic items** — content; attunement + curse infra is shipped.

### Monster-ability infrastructure (deferred — each needs new engine support)

> The shared bestiary's stat lines are in; these are the per-monster _special_
> abilities the current engine can't yet express. Ordered cheapest-first.
> (Shipped already: Pack Tactics, Bloodied Frenzy, bonus on-hit damage — all in
> `computeEnemyAttack`; see the Monsters item above. Plus the central
> enemy-damage hook below.)

- [x] **Central enemy-damage hook** → **Undead Fortitude** (Zombie) — shipped
      (`services/enemyDamage.ts`, `enemyDamage.spec.ts`). Rather than fold the
      ~28 kill sites into one resolver (their XP/drops/level-up/room-clear
      tails differ), extracted the one decision they all share — "what HP does
      this damage instance leave the enemy at" — into `enemyHpAfterDamage`, the
      single floor every PC-damage path routes through. It hosts Undead
      Fortitude (drop to 0 → CON save DC 5 + damage → cling to 1 HP, unless
      Radiant or a Crit) and is a **provable no-op for every enemy without the
      flag**, so the 31 existing monsters are unchanged. Wired into:
      resolveOneAttack (weapon, real crit flag), applySingleTargetDamage, AoE,
      save-with-damage, multi-target (Magic Missile / rays), Barbarian Frenzy,
      Monk Flurry, Colossus Slayer. Future on-"reduced to 0" traits (Troll
      Regeneration, damage thresholds, death triggers) hook here too.
      _Not yet routed_ (follow-ups): PC opportunity attacks (the OA helper has
      no seed access), Hurl Through Hell, and enemy-on-enemy / summoned-ally
      damage. Quivering Palm is correctly exempt (save-or-die, not damage).
- [x] **Max-HP-reduction mechanic** → **Life Drain** (Specter, Wight) — shipped
      (`lifeDrain.spec.ts`). On a hit, the Necrotic damage dealt also lowers the
      target's `max_hp` directly (so every heal/clamp honors it) while
      `life_drain_reduction` on `Character` tracks the restorable total. Specter
      drains its whole all-necrotic attack; the Wight drains only its necrotic
      `bonusDamage` rider (not the slashing primary). The target dies outright if
      a drain brings its maximum to 0. A Long Rest restores the maximum (and
      heals to it); Greater Restoration gained a 4th picker effect, `hp_max`,
      that lifts the cap without healing. `commitCharacter` now also mirrors
      `max_hp` onto the PC grid entity. (Deferred: the Wight's
      humanoid-rises-as-a-zombie clause — a campaign-timeline mechanic.)
- [ ] **Monster auras (emanations)** → **Stench** (Ghast). Generalize the
      start-of-turn `holyNimbusRadiant` hook into a reusable "save-or-condition /
      damage to creatures within N ft" aura, ticked at turn-start / round-wrap.
      Covers Stench + future aura monsters. Medium.
- [ ] **Enemy reactions** → **Parry** (Bandit Captain). The `pending_reaction`
      system is PC-only; add a defending-monster reaction window in the PC-attack
      resolver (mirror Shield's pause/resume). Interim cheap version: a passive
      "+2 AC vs the first melee hit each round." Medium–large.
- [ ] **Conditional extra actions** → **Rampage** (Gnoll: bonus move + bite
      after dropping a Bloodied creature). Needs the enemy bonus-action / extra-
      attack-after-kill economy — the same turn-flow gap as Haste's extra action.
      Larger.
- [ ] **Lighting / illumination model** → **Sunlight Sensitivity** (Kobold,
      Specter — Disadvantage in sunlight). No illumination substrate exists; this
      is the same architectural gap that blocks the Truesight / see-Invisible
      boons. Architectural; low priority for a dungeon-centric engine.
- [ ] **Grapple-on-hit** → **Griffon** (and constrictors). `onHitEffect` already
      accepts `grappled` (blocks movement, tracks `grappled_by`); the only gap is
      confirming a PC can escape a _monster's_ grapple via the existing contested
      check. Near-free — verify + wire.

### Frontend creation / choice surfaces (backend ready, FE pending)

> Several backend features auto-resolve today because the picker UI
> doesn't exist yet. The engine work is done; these are FE follow-ups.

- [x] **Epic-boon L19 pick** — at an ASI milestone of level 19+, `generateChoices`
      surfaces each qualifying Epic Boon feat as a `take_feat` choice alongside
      the +2 ASI (the +1 auto-targets the best eligible ability; Spell Recall is
      gated on spellcasting). `handleTakeFeat`/`applyFeatTake` already apply the
      boon + consume the ASI slot.
- [x] **Ability-score method picker** — CharScreen offers Roll 4d6 / Standard
      Array / **Point Buy** (27-point, 8–15, live budget + steppers) / **Manual**
      (free entry 3–20); point-buy math in `lib/pointBuy.ts`. The background
      **+2/+1 ability split** is also player-selectable (toggle between +2/+1
      across two of the background's three abilities and +1 to all three);
      `applyAbilityScoreIncreases` takes the chosen split and re-validates it,
      falling back to +1-to-all when invalid.
- [x] **Choose-your-class-skills step** — CharScreen offers each class's RAW
      "choose N from [options]" skill list (`SRD_CLASS_SKILL_CHOICES`; Bard =
      any 3, Rogue 4, Ranger 3, rest 2), pre-seeded with the curated default
      (`defaultClassSkills`, trimmed to N) and gated to exactly N. The server
      re-validates the chosen list (`resolveClassSkills`) and falls back to the
      default on anything invalid; options are surfaced via the context summary.
- [x] **Starting-equipment package choice** — CharScreen offers each class's
      RAW equipment packages (A / B / C with item lists + GP);
      `SRD_CLASS_STARTING_EQUIPMENT` + `resolveStartingEquipment` re-validate
      the chosen package id server-side, defaulting on anything invalid.
- [x] **Weapon-mastery picker + level-up scaling** — CharScreen offers the
      "choose N masterable weapons" grid (filtered by class proficiency),
      pre-seeded with `SRD_DEFAULT_WEAPON_MASTERIES` and gated to N;
      `resolveWeaponMasteries` re-validates. Slot count now scales with class
      level (`weaponMasterySlotsForLevel`: Fighter 3→4@4→5@10→6@16, Barbarian
      2→3@4→4@10, others fixed); `applyLevelUpForClass` raises
      `weapon_mastery_pending` and `generateChoices` surfaces the extra pick.
- [x] **Fighting-style picker (Fighter)** — CharScreen offers the 4 SRD styles
      for the Fighter's level-1 slot (`fightingStyleSlotsForClassLevel`),
      pre-seeded with the default; `resolveCreationFightingStyles` re-validates.
      Later grants (Fighter L7, Paladin/Ranger L2) are still picked in-game.
- [ ] **Interactive reaction prompts** — Indomitable, Stroke of Luck,
      Countercharm, Deflect Attacks auto-resolve player-favorably; let the
      player choose _when_ to spend.
- [ ] **Slot-choice surfaces** — Arcane Recovery / Natural Recovery
      auto-pick lowest-first; let the player choose which slots.
- [x] **Multi-target / option pickers** (RE-5) — shipped. Two generic
      GameChoice hints + their FE dialogs: **`pickTargets { side, max }`** →
      `TargetPickerDialog` (multi-select 1..max, defaults to the prior auto-pick;
      re-sends `targetCharIds`/`targetEnemyIds`), and **`pickOption { param, title,
options }`** → `OptionPickerDialog` (single-select; re-sends `action[param]`).
      Every cast path validates the choice and falls back to its auto-pick when
      absent. Riders: **Bless** (ally targets, `blessTargetPicker.spec.ts`),
      **Bane** (enemy targets — a single picker choice, not the per-enemy spread;
      cast applies `baned` per failed CHA save under one concentration,
      `baneTargetPicker.spec.ts`), **Polymorph** (beast-form option — the chosen
      form's HP becomes the polymorph Temp HP pool; beast forms gained an `hp`
      field), **Greater Restoration** (effect option: exhaustion / charmed /
      petrified — applies exactly one) — `optionPickers.spec.ts` +
      `OptionPickerDialog.spec.tsx`. Deferred: Greater Restoration's ally-target
      selection (the effect picker is self/auto-targeted for now).

### Documented engine deferrals (depend on missing content / infra)

- [ ] **Greater Divine Intervention** (Cleric L20) — needs a Wish spell.
- [ ] **Dragon Companion** (Draconic L18) — needs a Summon Dragon spell.
- [ ] **Contact Patron** (Warlock L9) — needs a Contact Other Plane spell.
- [ ] **Holy Ward half** (Devotion L20) — save sites don't carry the
      attacker's creature type yet (the Radiant aura ships).
- [ ] **Save-proficiency on enemy damage-spell saves** — `resolveEnemySpell`
      adds no proficiency bonus for any class, so Slippery Mind / Disciplined
      Survivor / Resilient don't reach that path. General gap, not feature-
      specific.
- [ ] **Truesight / Dimensional Travel / Night Spirit boons** — the +1
      ability lands; no see-Invisible substrate, concrete positioning, or
      lighting/Invisible-lifecycle to wire the effects to. Narrated only.
- Minor markers: Devious Strikes' Daze restriction, Use Magic Device
  scroll/charge sub-features, Thief Jumper, Lay on Hands poison-cure use,
  Deflect Energy (Monk L13) — pending broader enforcement/item/jump infra.

### Combat / exploration subsystems (bounded) — RE-4

- [ ] **Mounted combat** — `mount_id` exists but isn't enforced (forced
      dismount on damage, reach, ranged-while-mounted rules).
- [ ] **Underwater combat** — non-piercing melee disadvantage, ranged
      rules, fire resistance.
- [ ] **High Jump / verticality** — Long Jump shipped; High Jump is
      helper-only. Verticality is the architectural gap (flat grid, no
      elevation/ledges).
- [ ] **Wall of Force** — needs point/orientation targeting that pansori's
      enemy-only targeting doesn't express yet (Wall of Fire shipped; the
      `blocksMovement` path is in place).
- [ ] **FE grid-fog / vision reveal** — pairs with the shipped LoS blocking
      on the frontend (ghost-tint unseen cells, suppress enemy tokens).

### Condition + spellcasting fidelity (cleanups) — RE-5

- [x] **Condition-fidelity pass** — shipped (`conditionFidelity.spec.ts`).
      **Deafened** registered in the condition registry. **Petrified** carries
      its combat flags (attackers have Advantage, can't move, auto-fail STR/DEX;
      added to `ADVANTAGE_CONDITIONS`). Enemy self-disadvantage generalized to
      the full `DISADV_CONDITIONS` set — **poisoned / restrained / prone**
      enemies now attack at Disadvantage (joining blinded/frightened), which
      matters via Web / Entangle / Ensnaring Strike / Shove / Topple.
      Concentration's **incapacitation** gate was already explicit (the
      post-action sweep breaks concentration for any incapacitated/0-HP/dead
      caster) — now locked with a regression test. (**Slow**'s end-of-turn save + the enemy **incapacitation skip** shipped earlier — see the Spells
      section.) Deferred: **Petrified "Resistance to all damage"** (the damage
      pipeline keys off a type-list, and no SRD content in pansori applies
      Petrified yet, so it has no live trigger); **Charmed CHA-check** advantage
      for the charmer (needs social-check-site plumbing to identify
      charmer↔target — no clean surface today).
- [ ] **Multiclass edge cases** — ASI spacing validation, skill/tool grants
      on multiclass entry, warlock pact-slot pool separation, second-class
      subclass features.

### Subsystem follow-ups

- [ ] **Magic / Utilize action-category tags** — only needed for Action
      Surge's "extra action, except the Magic action" once a martial
      multiclasses into a caster. Bundle with multiclass UX.
- [ ] **Magic-item attunement — remaining** — short-rest attune gating,
      Remove Curse ↔ `de_attune` interaction, cursed items in seed loot.
- [ ] **Lighting — remaining** — cell-grained lighting (torchlight cones,
      darkness spells), auto-Blinded in dark rooms, lighting-adjusted active
      Perception. Room-grained Stealth/Perception already ships.
- [ ] **Somatic spell components** — RAW requires a free hand; needs a
      hand-state model. No spell carries a `somatic` flag yet. Also unlocks
      focus-substitutes-for-material.
- [ ] **Battleaxe mastery: Flex → Topple** — sandbox tags Battleaxe with the
      homebrew `flex`; RAW 2024 assigns Topple. Audit other Flex-tagged
      weapons; retire `flex` or document it as a pansori variant.
- [ ] **Out-of-combat systems** — Downtime, Bastions, Crafting (potions /
      scrolls / items), Vehicles. Lowest urgency.

### Narrative pipeline — structured fragments (partial)

- [ ] `twoWeaponAttack` fragment — off-hand outcomes emit no `CombatEvent`
      (needs a `two_weapon_hit` kind or prose alignment).
- [ ] Cleave-hit fragment — secondary-target damage emits no event.
- [ ] `resolveTarget(ctx, action)` helper to dedupe target resolution
      across ~5 sites.
- [ ] `cleric.ts` Divine Spark auto-hit → `spell_auto_hit` fragment (defer
      to a Divine Spark rework).

---

## Content & playtest

- [ ] **Wire boss legendary + lair actions to an actual boss** — scaffolding + tests exist; unwired pending a fitting boss (fourth-campaign showcase
      or post Crypt Lord re-balance). More effect kinds (terrain shift,
      debuff aura, summon, multi-attack legendary) as content demands.
- [ ] **Party line-of-sight indicators on the grid** — Bresenham LoS that
      respects the shipped obstacles; ghost-tint cells the active PC can't
      see, suppress enemy tokens beyond the existing `dark`-illum fog. ~1 day.
- [ ] **Fourth campaign module (opportunistic)** — coastal pirate town,
      desert ruin, planar city, etc. Not on the critical path.

---

## Type-share infrastructure

- [ ] **Phase 3 of type-share** (remaining workspace-local: Character,
      GameState, Seed, Trap, Room, OnHitEffect, BossPhase, EnemyTemplate,
      Enemy, Spell, BeastForm, InventoryItem, TurnActions, DeathSaves,
      Context/FrontendContext, Location, GameRule, RuleFacts, CampaignFacts).
      These cascade-share, need FE↔BE reconciliation, or are intentionally
      separate. Defer until there's a concrete reason to share each one.

---

## UX & polish

- [ ] **Tutorial / onboarding** (deferred-to-launch) — 2-room intro covering
      the action loop, grid combat, inventory modal. Held until the engine
      surface stabilizes near launch.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind
      `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat cues.
- [ ] **LLM enhancement cost guards** (deferred-to-launch) — per-session
      token budget, short-event skip threshold, `LLM_ENHANCEMENT=off` kill
      switch.

---

## Engine & infrastructure

- [ ] **Save/state persistence across redeploys (manual verify)** —
      `normalizeState` specs assert a state row missing post-rollout fields
      loads + survives a `takeAction`. Still TODO: actual end-to-end exercise
      (start → redeploy → resume → confirm parity). ~30 min.
- [ ] **Difficulty tuning from playtest data** — capture damage/HP/encounter
      telemetry to inform tuning (Crypt Lord TPK was the first signal).
      ~3-4h to wire telemetry; ongoing to tune.
- [ ] **Regression-spec coverage gaps** — Bless on 4+-member parties, Monk
      Flurry kill-on-first-strike, Frenzy with no enemy in range, the
      unknown-feature fallback. ~2-3h.
- [ ] **Pre-commit hook (Husky + lint-staged)** — auto-run eslint + prettier
      on staged files; catches prettier-dirty code before CI. ~30 min;
      bypassable with `--no-verify`. CI lint stays the gate.

### Lower urgency (flag now, defer)

- [ ] **Multiplayer delta protocol** — full-state replace per action is fine
      at current scale; revisit when broadcast size hurts (more PCs, larger
      maps, persistent NPCs). Don't prebuild.
- [ ] **Server-side invariants** — `castSpell` checks slots only as a
      permission gate; stale-state actions get accepted. With `turn_seq` on
      the wire, assert `spell_slots_used <= max`, `hp <= max_hp`, action
      budget and reject with 409. Tighten when an exploit surfaces.
- [ ] **Observability** (needs-input) — only `console.log` today; Sentry /
      structured logging would surface prod issues. Requires choosing a service.
- [ ] **CHANGELOG.md** (needs-input) — no user-visible change log. Keep one?
      Which format?
- [ ] **Post-deploy health check + rollback** (needs-input) — CI deploys via
      SSM but doesn't poll `/api/health` or roll back on failure. ~2-3h.

---

## Accessibility audit

> Code-survey pass (WCAG 2.1 AA). Already strong: focus-visible outlines,
> aria-labels on icon buttons, tablist semantics + arrow-key nav, focus-trap
>
> - Esc-close dialogs, aria-live combat narrative, real `<button>` party
>   tiles. Gaps below; manual SR + keyboard-only validation is the next step.

- [ ] **fieldset/legend on grouped form controls** — CharScreen's `PORTRAIT`
      / `ABILITY SCORES` group descriptors use plain `<label>`; the right
      HTML is `<fieldset><legend>` (or `role="group"` + `aria-labelledby`).
- [ ] **HP / condition live-region updates** — HP bars + condition badges
      update silently; an off-screen `aria-live` delta summary would help SR
      users track state. Needs UX tuning on when to announce.
- [ ] **Manual SR + keyboard-only validation** — exercise with VoiceOver /
      NVDA / JAWS and Tab-only to find what the code review missed.

---

## Security audit

> Solid foundation: helmet headers, CORS pinned to `FRONTEND_URL`, Postgres
> sessions with httpOnly + secure + sameSite cookies, auth rate-limit, all
> queries parameterized, passport + Google OAuth. The single-tenant model
> masks issues that bite when `session_participants` lands.

- [ ] **CSRF on state-changing endpoints** — prod cookies use
      `sameSite: 'none'`, so the session cookie rides cross-origin POSTs.
      Options: tighten to `lax` if cross-origin isn't needed; double-submit
      token; or `X-Requested-With` header. **Needs a design call first.**
- [ ] **Multiplayer: session ownership + turn enforcement** —
      `game_sessions.user_id` is single-tenant; `takeAction` doesn't verify
      `req.user.id === characters[active].owner_user_id`.
- [ ] **`npm audit` in CI** — fail PR builds on `high`/`critical`. ~15 min
      YAML; ongoing triage.
- [ ] **CSP for any future HTML-serving paths** — helmet CSP is off (API
      returns no HTML); re-enable with tight `script-src 'self'` if we ever
      serve files/images directly.
- [ ] **Session fixation protection** — confirm `express-session` rotates
      the session id on login (passport regenerates by default).

---

## Deployment reference

Shipped: ECR, EC2, RDS, direct EC2 + nginx, Let's Encrypt (certbot webroot
auto-renew), GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker
Compose prod. Required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
