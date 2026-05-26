# TODO

> **Status snapshot — verified 2026-05-25.** The top section is the
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

## Implementation status (code-verified 2026-05-25)

Grounded in a code survey + the full backend suite: **1572 tests across
184 files, all green** (lint + typecheck clean).

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

| Category | In pansori | SRD universe |
|---|---|---|
| Spells | **180** (26 cantrips + 154 leveled, through L9) | ~330 |
| Shared SRD monster pool | **12** (`SRD_MONSTERS`) + per-campaign templates | hundreds |
| Species | 9 | 9 standalone + Drow lineage |
| Classes | 12 | 12 |
| Subclasses | 12 iconic (1 / class) | 1 iconic / class in SRD |
| Origin feats / epic boons | 6 / 7 | 4 (+Magic Initiate variants) / 7 |

**Bottom line:** the rules-engine frameworks and the entire class/subclass
progression are done. What remains is overwhelmingly **content breadth**
on existing patterns, **frontend creation/choice surfaces** that finished
backend features are waiting on, and a handful of **bounded subsystems**.

---

## Remaining work

### Content breadth — data on existing patterns (RE-6)

- [ ] **Spells** — ~180 / ~330 SRD. Most remaining categories are already
      representable (data entry).
  - [~] **Persistent damage zones** — foundation shipped (RE-4): `GameState.spell_zones`
        + `SpellZone`, the `persistentZone` spell flag, cast-time `runZoneSpell`
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
  - [~] **Recurring spell attacks** — shipped (RE-4): `Character.recurring_attack`
        + the `recurring_spell_attack` action, `resolveRecurringAttack` (spell
        attack vs AC → damage + optional heal), cast-time setup
        (`runRecurringAttackSpell`), round-wrap expiry + concentration cleanup.
        **Spiritual Weapon** (Bonus-Action force attack, +spellcasting mod, no
        concentration) and **Vampiric Touch** (Magic-action necrotic that heals
        half, concentration) ride it.
  - [~] **Enchantment control** — foundation shipped (RE-4): the `commanded`
        condition + an enemy-turn skip block (the creature loses its turn and
        the condition is consumed). **Command** (L1, WIS save → "Halt": lose
        your next turn) rides it. Next on this base: **Confusion** (AoE +
        random-behavior re-save — needs the AoE-condition-to-all fix below),
        **Compulsion** (forced movement), and **Dominate** (full enemy control).
        Command's RAW upcast (one extra target per slot ≥ 2) is deferred
        (single-target cast); other command words (Approach/Flee/Grovel/Drop)
        collapse to the "Halt" turn-loss model.
      Exceptions still needing a model first: the alternate "summon" spells,
      each mechanically distinct from the stat-block ally model —
  - [ ] **Conjure Animals** (L3) + other 2024 conjure spells — a
        concentration _damage zone_ (DEX save, scaling dice); closer to a
        moving AoE/hazard than a summoned creature.
  - [ ] **Find Familiar** — a non-combatant utility companion (can't take
        the Attack action RAW); a scouting/aid model, not the ally-turn AI.
- [ ] **Monsters** — stat-block content. Legendary + lair scaffolding is
      shipped (`legendary_actions` point pool; `lair_actions` round-wrap
      AoE) but not wired to any current boss (per-encounter balance was
      tuned without them). Effects shipped: `extra_attack`, `aoe_save_damage`.
- [ ] **Magic items** — content; attunement + curse infra is shipped.

### Frontend creation / choice surfaces (backend ready, FE pending)

> Several backend features auto-resolve today because the picker UI
> doesn't exist yet. The engine work is done; these are FE follow-ups.

- [ ] **Epic-boon L19 pick** — surface the boon choice at the L19 ASI.
- [ ] **Ability-score method picker** — let the player choose point buy /
      standard array / manual and (for the +2/+1 RAW split) which abilities.
      Backend applies the "all three +1" option today.
- [ ] **Choose-your-class-skills step** — replace the auto-granted curated
      `SRD_CLASS_SKILLS[class]` list with "choose N from [SRD options]";
      engine must accept + validate the chosen list.
- [ ] **Interactive reaction prompts** — Indomitable, Stroke of Luck,
      Countercharm, Deflect Attacks auto-resolve player-favorably; let the
      player choose _when_ to spend.
- [ ] **Slot-choice surfaces** — Arcane Recovery / Natural Recovery
      auto-pick lowest-first; let the player choose which slots.
- [ ] **Multi-target / option pickers** — Bless/Bane/upcast +1 target,
      Polymorph beast pick, Greater Restoration "pick one effect" (RE-5).

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

- [ ] Register **Deafened**; add **Petrified** damage resistance + save
      advantage; **Charmed** CHA-check disadvantage; **Slow** end-of-turn
      recurring save; make concentration's **incapacitation** gate explicit.
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

- [ ] **Wire boss legendary + lair actions to an actual boss** — scaffolding
      + tests exist; unwired pending a fitting boss (fourth-campaign showcase
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
> + Esc-close dialogs, aria-live combat narrative, real `<button>` party
> tiles. Gaps below; manual SR + keyboard-only validation is the next step.

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
