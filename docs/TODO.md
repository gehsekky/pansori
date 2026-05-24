# TODO

<!-- Completed items pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

> **⚠ SRD-only scope reset (2026-05-23):** Pansori was refactored to
> strict SRD 5.2.1 — non-iconic subclasses, PHB-only feats, Aasimar,
> and PHB-only spells were all removed. See
> [srd-only-audit.md](srd-only-audit.md) for the migration record.
>
> Entries that referenced now-removed PHB-only features (Lucky,
> Sharpshooter, Sentinel, GWM, Polearm Master, Battle Master
> maneuvers, Stars Druid constellations, Aasimar Celestial
> Revelation, Silvery Barbs, etc.) have been pruned from this file.
> See [srd-only-audit.md](srd-only-audit.md) for the full removal
> record.
>
> Net-new content additions should grep `docs/srd-5.2.1.txt` first.

## 5e SRD remaining gaps

> **Edition alignment** — Pansori targets SRD 5.2.1 only. The core
> rules _frameworks_ are largely shipped (attack/damage pipelines,
> conditions, grid/tactical combat, spell slots + concentration +
> components + AoE shapes + saves, reactions, rest/death, the
> bring-from-dead ladder, weapon masteries, 12 SRD-iconic subclasses
> at their L3 feature). The remaining work to a _complete_ engine is
> overwhelmingly **breadth on top of those frameworks** — the
> prioritized gaps live in the rules-engine roadmap immediately below.

### Rules-engine completeness roadmap (2026-05-23)

> Derived from a full code survey on 2026-05-23. The frameworks exist;
> what's left is mostly feature/content breadth plus a handful of
> bounded subsystems. Ordered by leverage. Per the project workflow,
> grep `docs/srd-5.2.1.txt` for the canonical feature list before
> implementing any item here.

#### RE-1: Monsters as first-class action subjects (unblocks the most)

> Phases 1–3 shipped (2026-05-23, the `refactor(re-1):` commit series):
> the `Actor` type seam, the `updatePcActor` helper, and all isolated
> PC-state handlers now read/write via `ctx.actor` with a
> `kind !== 'pc'` guard (the Phase-4 enemy-action slot). What's left is
> the payoff, below.

- [ ] **Phase 4 — summons & companions as combatants** (plan of record:
      [re1-phase4-design.md](re1-phase4-design.md); pragmatic path approved
      2026-05-23). Generalize the enemy-turn loop to drive any non-player
      combatant via a `side: 'pc'|'enemy'|'ally'` tag + stat-block actors,
      reusing `computeEnemyAttack` rather than merging it with the PC
      `resolveOneAttack` (still fully SRD-compliant — monster stat blocks
      pre-bake what PCs compute; see the design doc). Unblocks **SRD summons**
      (Animate Dead, Spiritual Weapon, Find Familiar, conjure) — narrative-only
      today. (Beast Master is PHB-only / out of scope — the SRD's iconic
      Ranger subclass is Hunter; summon _spells_ are the content.) Decisions:
      RAW player-command control model; **Animate Dead** is the first content
      slice. Slices P4.1 (side tagging), P4.2/3 (ally turn path with movement —
      `runAllyTurn` selects the nearest enemy, approaches it taking OA, and
      attacks via the simple `resolveEnemyAttack` + `applyDamageToEntity`),
      P4.4 (summon lifecycle — `addAllyCombatant` / `removeCombatant` + the
      `breakConcentration` summon sweep), and the P4.5 **combat-start bridge**
      (`state.summoned_allies` + `seedSummonedAllies` materialize persistent
      summons into entities + initiative after the owner) have all shipped.
      Remaining is content:
  - [ ] **P4.5 — SRD summon content (Animate Dead shipped 2026-05-23).**
        Animate Dead raises a Skeleton ally: out-of-combat cast (gated in
        precast) → `runSummonSpell` records it on `summoned_allies` →
        `seedSummonedAllies` materializes it at combat start → it fights via
        the AI-default `runAllyTurn`. The owner can also override its target
        on their own turn via the bonus-action `command_summon`
        (shipped 2026-05-23: sets `commanded_target_id`, which
        `selectTarget` prefers while that enemy lives). The Zombie variant +
        upcast multi-raise shipped 2026-05-24 (`summon.variants` /
        `countPerUpcastLevel`; the cast menu offers Skeleton/Zombie per slot
        level, raising +2 per level above 3rd — SRD-verified stat blocks).
        Animate Dead is **content-complete** for the creature-summon model.

    The creature-summon-as-ally infrastructure cleanly covers stat-blocked
    summons only. The other 2024-SRD "summon" spells are mechanically
    different and each need their own model (NOT drop-in stat blocks) —
    deferred as separate slices:
    - **Spiritual Weapon** (L2): a floating _force_ with no HP; a
      bonus-action melee spell attack you re-issue each turn. Model as a
      persistent bonus-action attack effect, not an ally combatant.
    - **Conjure Animals** (L3) and the other 2024 conjure spells: a
      concentration _damage zone_ (spectral spirits; DEX save, scaling
      dice), closer to a moving AoE/hazard than a summoned creature.
    - **Find Familiar**: a non-combatant utility companion (familiars
      can't take the Attack action RAW) — a scouting/aid model, not the
      ally-turn AI.

  Deferred → now in progress as **EE (dispatcher-integrated enemy turns)**,
  below.

- [x] **Phase 5 (done 2026-05-24)** — dropped `ctx.char` / `ctx.safeIdx`
      from `ActionContext`; every handler now reads the acting character via
      `ctx.actor` (narrow `ctx.actor.kind === 'pc'` → `ctx.actor.char`, mutate
      through `updatePcActor`). All 734 `ctx.char` refs migrated across ~30
      files; `updatePcActor` is the single write path, `commitChar` /
      takeAction epilogue / dispatcher `deductCost` read `ctx.actor.char`.
      Surfaced + fixed a latent divergence bug along the way (a direct
      `ctx.char =` on every cast broke the concentration-save spells). With
      this, RE-1's actor seam is fully landed: PC and (future) monster
      handlers can share one implementation.

#### EE: Dispatcher-integrated enemy turns (full path, multi-commit)

> Started 2026-05-24. Routes the enemy turn through `dispatchAction` with
> an `enemyActor`, so enemy attacks/spells run through registered handlers
> (the seam that lets PC + monster share abilities). The PC/enemy attack
> _resolvers_ stay distinct (PC equipment math vs monster stat-block math
> are legitimately different) — what unifies is the dispatch _entry_.
> Combat-critical (proposed-snapshot reaction windows + pause/resume), so
> landed as small, full-suite-gated commits.

- [x] **EE-1 (done 2026-05-24)** — behavior-preserving extraction of the
      single-sub-attack core (`computeEnemyAttack` + Shield / Uncanny Dodge
      / Hellish Rebuke reaction windows + Orc Relentless Endurance + massive
      -damage death) out of `runEnemyMultiattackLoop` into
      `resolveEnemySubAttack` (tagged `paused` / `killed-massive` / `done`
      result). Makes the per-attack core reusable by the dispatched handler.
      Suite 1046 green.
- [x] **EE-2 (done 2026-05-24)** — `enemy_attack` action + `handleEnemyAttack`
      (wraps `resolveEnemySubAttack`); `runEnemyMultiattackLoop` now routes each
      swing through `dispatchAction(ctx{actor: enemyActor(rm, ent)}, …)` via a
      `buildEnemyActionCtx` helper. The loop + `runEnemyTurns` went async
      (awaited in `takeAction` and `handleResolveReaction`). The handler reports
      its tagged outcome on a new `ctx.enemySubAttack` side-channel (the loop
      reads it); the post-swing death-save + commit stay in `runEnemyTurns`.
      No new `DispatchResult` variant needed — pause flows through
      `st.pending_reaction` as before. Suite 1049 green (incl. all reaction /
      death-save specs unchanged).
- [x] **EE-3 (done 2026-05-24)** — enemy spell resolution now routes through a
      dispatched `enemy_cast` action (`enemyActor`). Extracted `resolveEnemySpell`
      (the roll-damage + saving-throw + commit core) out of
      `attemptEnemySpellCast`; the orchestrator keeps the cast DECISION
      (castChance / spell pick) + the Counterspell pause window, and `await`s
      `dispatchAction(..., { type: 'enemy_cast', … })` for the no-counterspeller
      branch. The enemy spell model (`{ damage, savingThrow, saveEffect }`)
      stays distinct from the PC `castSpell` pipeline by design — same
      shared-entry/distinct-resolver split as EE-2. Suite 1053 + handler spec.
- [x] **EE-4 (done 2026-05-24)** — the enemy approach/move step now routes
      through a dispatched `enemy_move` action (`enemyActor`), wrapping
      `attemptEnemyApproach` (path-plan + opportunity attacks + position
      commit) and reporting proceed-to-attack / skip-turn via a
      `ctx.enemyApproach` side-channel. Suite 1057 + handler spec.

  **EE epic complete.** A whole enemy turn now runs as a sequence of
  dispatched actions with an `enemyActor` — `enemy_move` → (`enemy_cast`
  | `enemy_attack`×N) — through the same `dispatchAction` path as PC
  actions. `runEnemyTurns` is now an orchestrator over the AI/perception
  decisions that aren't actions (target selection, hide check, turn-skip
  conditions, the Counterspell/reaction pause windows). The PC and enemy
  attack/spell _resolvers_ stay deliberately distinct (PC equipment +
  slots vs monster stat-block math); what's unified is the dispatch
  entry, so shared PC↔monster abilities can hook in from one place.
  Deferred (genuinely not worth it): merging the resolvers themselves.

#### RE-2: Class + subclass feature progression to L20

> Today most classes implement features only through ~L3–L5, with a
> few scattered higher gates (Monk die scaling L17, Improved Divine
> Smite L11). Subclasses mostly carry just their L3 feature; Wizard has
> almost no class features. The resource-pool + handler machinery
> exists, so most of this is data + dispatcher pattern, parallelizable
> per class. The "gaps" column is a pointer, not an authoritative level
> table — grep the SRD per class before implementing. (Spot-audit
> 2026-05-24: the table is already partly stale — e.g. Extra Attack is
> fully done, 2/3/4 scaling via `extraAttackCount`.)

- [x] **Fighting Style (done 2026-05-24)** — all four SRD 5.2.1 styles
      (Archery / Defense / Great Weapon / Two-Weapon; Dueling/Protection are
      PHB-only and excluded). Granted by class features (Fighter L1 + L7,
      Paladin/Ranger L2). `Character.fighting_styles` + `choose_fighting_style`
      action/handler (`fightingStyleSlots` accounting, multiclass-summed,
      distinct picks) + out-of-combat choice surface. Effects: Archery (+2
      ranged to-hit, `toHit`), Two-Weapon (off-hand ability mod,
      `twoWeaponAttack`), Defense (+1 AC while armored — `defenseAcBonus`
      post-step at every `computeTotalAc` recompute site + immediate AC bump
      on pick), Great Weapon Fighting (reroll 1s/2s on two-handed melee
      damage — `rollDiceGwf`/`rollCriticalGwf` threaded through
      `resolvePlayerAttack`; two-handed = heavy melee or versatile-used-2H).
      Note: GWF on opportunity attacks deferred (the `gameEngine` PC-OA
      `resolvePlayerAttack` call defaults `gwf=false`).
- [x] **Evasion (done 2026-05-24)** — Rogue L7 / Monk L7 passive (`hasEvasion`
      in multiclass.ts). On a DEX save-for-half effect: no damage on a success,
      half on a failure; unavailable while Incapacitated. Applied in
      `resolveEnemySpell` (the enemy damage-spell save path — the only place a
      PC takes enemy save-for-half damage today). Spec covers the helper +
      both damage outcomes vs the non-Evasion baseline.

| Class     | Implemented (approx)                                                  | Major SRD gaps to fill                                                                                                                                          |
| --------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barbarian | Rage, Reckless (L1–2), Frenzy (L3)                                    | Danger Sense, Extra Attack, Fast Movement, Feral Instinct, Brutal Strike, Relentless Rage, Persistent Rage, Indomitable Might, capstone; exhaustion-on-rage-end |
| Bard      | Bardic Inspiration (L1), Cutting Words (L3)                           | Expertise, Jack of All Trades, Font of Inspiration, Countercharm, Magical Secrets, Superior Inspiration, capstone                                               |
| Cleric    | Channel Divinity, Turn/Sear Undead, Preserve Life (Life)              | Blessed Strikes, Divine Intervention, improved Channel uses, higher Life-domain grades                                                                          |
| Druid     | Wild Shape (L2, CR L4/8), Land's Aid                                  | Wild Companion, full Circle of the Land grades, Wild Shape improvements, Beast Spells, Archdruid                                                                |
| Fighter   | Second Wind, Action Surge (L2), Tactical Master (L9)                  | Fighting style, Extra Attack 2/3/4, Indomitable, Champion grades (Remarkable Athlete, Additional Style, Superior Critical, Survivor)                            |
| Monk      | Martial Arts, Flurry/Patient/Step (L2), Stunning Strike (L5)          | Deflect Attacks, Slow Fall, Stillness of Mind, Evasion, Self-Restoration, Disciplined Survivor, Empty Body, Body & Mind, higher Open Hand grades                |
| Paladin   | Sacred Weapon (Devotion L3)                                           | Fighting style, Extra Attack, Aura of Protection (L6), Aura of Courage, Faithful Steed, Divine-Smite-as-feature, Devotion grades, capstone                      |
| Ranger    | Colossus Slayer (Hunter L3)                                           | Fighting style, spellcasting integration, Extra Attack, Roving, Expertise, Tireless, Nature's Veil, Hunter grades                                               |
| Rogue     | Cunning Action (L2), Cunning Strike (L5), Sneak Attack, Uncanny Dodge | Steady Aim, Evasion, Reliable Talent, Slippery Mind, Elusive, Stroke of Luck, Assassin grades                                                                   |
| Sorcerer  | Metamagic (L3–5), sorcery points                                      | Innate Sorcery, Sorcerous Restoration, SP↔slot conversion completeness, full Draconic grades, capstone                                                          |
| Warlock   | Agonizing Blast (passive)                                             | Eldritch Blast beam scaling, Pact Boon, more invocations, Mystic Arcanum, Magical Cunning, Fiend grades, Eldritch Master                                        |
| Wizard    | cantrips only (Arcane Ward partial)                                   | Arcane Recovery, Scholar, Memorize Spell, Spell Mastery, Signature Spells, full Evoker grades                                                                   |

#### RE-3: Character-build systems (small, high RAW payoff)

- [ ] **Fighting styles** — SRD 5.2.1 has 4: Archery, Defense, Great
      Weapon Fighting, Two-Weapon Fighting. None implemented. Needed by
      Fighter / Paladin / Ranger.
- [ ] **Epic boons** (L19+ feat options) — SRD has 7: Combat Prowess,
      Dimensional Travel, Fate, Irresistible Offense, Spell Recall, the
      Night Spirit, Truesight. Slot into the existing `take_feat` surface.
- [ ] **Exhaustion (2024 model)** — replace the binary-disadvantage-at-L3
      approximation with the RAW **−2 to all d20 tests per level** and
      **−5 ft speed per level**. `reviveD20Penalty` already shows the
      per-d20 numeric-penalty threading pattern.
- [ ] **Ability-score generation** — standard array / point buy at
      character creation (scores are effectively hard-coded today).

#### RE-4: Combat / exploration subsystems (bounded)

- [ ] **Wall/terrain spells as real grid blockers** — transient grid
      obstacles that expire on concentration drop (Wall of Fire / Force).
- [ ] **Mounted combat** — `mount_id` exists but isn't enforced (forced
      dismount on damage, reach, ranged-while-mounted rules).
- [ ] **Underwater combat** — non-piercing melee disadvantage, ranged
      rules, fire resistance.
- [ ] **Jumping** (long = STR ft, high = 3 + STR mod ft) — also flagged
      under architectural blockers.
- [ ] **Line-of-sight / vision blocking by walls** — Bresenham LoS
      respecting obstacles (pairs with the FE grid-fog item).
- [ ] **Massive-damage instant death** (single hit ≥ max HP).

#### RE-5: Condition + spellcasting fidelity (cleanups)

- [ ] Register **Deafened**; add **Petrified** damage resistance + save
      advantage; **Charmed** CHA-check disadvantage; **Slow** end-of-turn
      recurring save; make concentration's **incapacitation** gate explicit.
- [ ] **Choice-UX mechanics** that auto-resolve today: Polymorph beast
      pick, Greater Restoration "pick one effect," multi-target picker
      (Bless / Bane / upcast +1 target). Part engine, part FE.
- [ ] **Multiclass edge cases** — ASI spacing validation, skill/tool
      grants on multiclass entry, warlock pact-slot pool separation,
      second-class subclass features.

#### RE-6: Content (data on existing patterns, not engine)

- [ ] **Spells** — ~112 of ~330 SRD spells. Most remaining categories
      are already representable (data entry); summons depend on RE-1, a few
      "pick an option" spells on RE-5's picker.
- [ ] **Monsters** — stat-block content; legendary/lair effects can use
      the shipped scaffolding (see boss-wiring item under Content & playtest).
- [ ] **Magic items** — content; attunement + curse infra is shipped.

### Remaining subsystem follow-ups

> Open items from the earlier (2026-05-21) mechanics roadmap whose
> frameworks have shipped. Mounted combat, jumping, multiclass edge
> cases, and somatic-component enforcement now live in the RE-1…RE-6
> roadmap above; the rest:

- [ ] **Magic / Utilize action-category tags** — category wrappers
      (cast_spell + magic-item-use + magical features = Magic; mundane
      item-use + interact_object = Utilize). Only needed for Action Surge's
      "extra action, except the Magic action" rule once a martial
      multiclasses into a caster. Bundle with multiclass UX.
- [ ] **Magic-item attunement — remaining** — short-rest attune gating
      per RAW, Remove Curse ↔ `de_attune` interaction, and cursed items in
      seed loot tables (only spec fixtures carry them today).
- [ ] **Lighting — remaining** — cell-grained lighting (torchlight
      cones, darkness spells), auto-apply Blinded in dark rooms, and
      lighting-adjusted active Perception (search). The room-grained
      Stealth/Perception path already shipped.
- [ ] **Somatic spell components** — RAW requires a free hand; needs a
      hand-state model (weapon + shield = both hands, two-handed = both).
      No spell carries a `somatic` flag yet. Also unlocks the
      focus-substitutes-for-material rule.
- [ ] **Battleaxe mastery: Flex → Topple** — sandbox tags Battleaxe with
      the homebrew `flex` mastery; RAW 2024 assigns Topple. Audit the other
      Flex-tagged weapons and either retire `flex` or document it as a
      pansori variant.
- [ ] **Out-of-combat systems** — Downtime activities, Bastions,
      Crafting (potions / scrolls / items), Vehicles. Lowest urgency.

### Subclass coverage (2026-05-23 — 12 SRD-iconic, one per class)

> The SRD-only reset removed all non-iconic subclasses (and the
> Aasimar species + its Healing Hands / Celestial Revelation
> actions). The 12 iconic subclasses that remain — one per class —
> are each selectable with their iconic L3 feature wired + tested:
> Berserker, College of Lore, Life Domain, Circle of the Land,
> Champion, Open Hand, Oath of Devotion, Hunter, Assassin, Draconic
> Sorcery, Fiend, Evoker. See [srd-only-audit.md](srd-only-audit.md)
> for the full subclass + species removal record.

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
- [ ] **Regression-spec coverage gaps** — add targeted specs for Bless on 4+-member parties, Monk Flurry kill-on-first-strike, Frenzy with no enemy in range, and the unknown-feature fallback (gaps surfaced during the action-handler refactor). ~2-3h.

- [ ] **Pre-commit hook (Husky + lint-staged)** — auto-run eslint + prettier on staged files before commit. Catches the class of bug where prettier-dirty code reaches CI and fails the build. ~30 min setup; bypassable with `--no-verify`. CI lint stays as the gate.

### Architecture audit follow-ups

> **2026-05-21 architecture review** identified the rules/state seams that
> will make adding 5.5e features (more conditions, more spells, more
> monster abilities) progressively harder. Priority order below is by
> leverage — items 1-3 pay for themselves within 2-3 features and
> compound; 4-7 are medium-leverage; 8-9 are flagged but deferred.

#### Medium leverage

- [~] **4. Narrative pipeline — structured fragments** (multi-stage
  migration; attack + spell + enemy-side paths shipped). Remaining:
  - [ ] `twoWeaponAttack` fragment migration — needs a `two_weapon_hit`
        kind or prose alignment; off-hand outcomes emit no `CombatEvent` today.
  - [ ] Cleave-hit fragment — secondary-target damage emits no event.
  - [ ] `resolveTarget(ctx, action)` helper to dedupe target resolution
        across ~5 sites.
  - [ ] `cleric.ts` Divine Spark auto-hit → `spell_auto_hit` fragment
        (defer until a Divine Spark rework).

- [~] **5. Monsters as first-class action subjects** (extraction +
  type-seam + Phase-3 handler migration shipped; dispatcher integration
  is **RE-1** above). `runEnemyTurns` is decomposed into named handlers;
  the `Actor` union + `ctx.actor` seam is in place; all isolated PC-state
  handlers now read/write via `ctx.actor`. Remaining = phases 4–5: wire
  enemy turns through `dispatchAction` so shared abilities (Stunning
  Strike, smites, …) run for PCs and monsters from one path, then drop
  `ctx.char` / `ctx.safeIdx`.

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
