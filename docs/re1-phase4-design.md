# RE-1 Phase 4 — Design Pass

> Status: **proposal, for review.** Phases 1–3 of the actor migration
> shipped (the `Actor` type seam + all isolated PC-state handlers read/
> write via `ctx.actor`). This doc designs Phase 4 before any hot-path
> combat code is touched. See [TODO.md](TODO.md) → RE-1.

## Goal (what success looks like)

The **payoff** is content that's narrative-only today taking *real turns*:
**summoned creatures and companions** — Beastmaster companion, Find
Familiar, conjure spells, Spiritual Weapon. A secondary, oft-stated goal
was *code unification* ("one attack/spell implementation for PCs and
monsters").

This design argues those two goals should be **decoupled**, and that the
payoff is reachable at far lower risk than the unification.

## Current reality (three attack paths, one loop)

- **PC actions** run through `dispatchAction` (`services/actions/`): the
  `ActionContext` is PC-centric — `char: Character`, `safeIdx` (index into
  `st.characters`), `actor: pcActor(...)`, and `commitChar()` writes to
  `st.characters` + syncs the grid entity.
- **Enemy turns** run through `runEnemyTurns` (`gameEngine.ts`), which owns
  a fixed sequence — surprise → banish/polymorph skips → legendary refresh
  → `selectEnemyMeleeTarget` → `resolveEnemyHideCheck` →
  `attemptEnemySpellCast` → `attemptEnemyApproach` → `runEnemyMultiattackLoop`
  → death save → `commitCharacter` → advance `advIdx`. The helpers return
  shaped results; the loop owns initiative advancement and the reaction
  pause/resume coordinates.
- **Three** attack resolvers exist: `resolveOneAttack` (PC — rich: ability
  mods, proficiency, weapon properties, Sneak Attack / Rage / Divine Smite,
  subclass gates), `computeEnemyAttack` (enemy — fixed `toHit`/`damage`,
  *plus* the proposed-snapshot pattern that powers PC reactions), and
  `resolveEnemyAttack` (rulesEngine — the simple OA roll).
- **Enemies have no `Character` record** — only a `CombatEntity` (in
  `st.entities`) and seed stats (`toHit`, `damage`, `multiattack`). They
  live outside `st.characters` entirely.

## The pivotal decision: how far to unify

The original RE-1 framing (audit item 5) was the **maximal** version: route
enemy turns through `dispatchAction` with an `enemyActor`, and merge
`resolveOneAttack` + `computeEnemyAttack` into one actor-agnostic handler.
The integration survey found three real risks in that path:

1. **Attacker polymorphism** — `resolveOneAttack` reads `ctx.char`'s ability
   scores, proficiency, subclass, feats, and inventory. An enemy has *none*
   of these (fixed `toHit`/`damage`). Merging means branching the hottest
   function in the engine on attacker kind.
2. **Proposed-snapshot threading** — PC reactions (Shield, Uncanny Dodge)
   rely on `computeEnemyAttack` computing the whole outcome once, stashing
   it on `pending_reaction`, then committing or discarding on resolve.
   Re-routing attacks through per-call dispatch risks re-resolving and
   contradicting the reaction.
3. **Initiative/loop ownership** — `runEnemyTurns` owns `advIdx`/`resumeMi`
   and the pause/resume contract. `dispatchAction` mutates `ctx` in place
   and has no notion of "this combatant's turn is over." Moving the loop
   into the dispatcher re-couples what Phase-5 extraction just separated.

**Recommendation: take the pragmatic path (B), defer the maximal path (A).**

The key insight: **companions and summons have monster-style stat blocks,
not character sheets.** A wolf companion or a conjured elemental attacks
with a fixed `toHit`/`damage` — exactly the `computeEnemyAttack` shape, *not*
`resolveOneAttack`. So the payoff needs the **enemy** attack path
generalized to "any non-player combatant," **not** the PC attack path
merged in. That neutralizes all three risks:

- Risk 1 → avoided: allies/summons never touch `resolveOneAttack`; no
  `ctx.char` null-ref. PCs keep their rich path untouched.
- Risk 2 → avoided: PC reactions already fire against attacks *on a PC*
  via `computeEnemyAttack`; that path is reused unchanged. Allies attacking
  enemies need no PC-style reaction window (pansori enemies have none).
- Risk 3 → avoided: keep `runEnemyTurns` owning the loop; do **not** route
  NPC turns through `dispatchAction`.

## Recommended approach (B): non-player combatants via the generalized loop

### Data model
- `CombatEntity` gains a **side**: `side: 'pc' | 'enemy' | 'ally'` (default
  derived from the existing `isEnemy` for back-compat). Allies = companions
  and summons.
- A non-enemy combatant carries a **stat block** (reuse the `EnemyStats`
  shape: `toHit`, `damage`, `multiattack`, `ac`, `hp`, `speedFt`,
  `attackReachFt`).
- **Summon lifecycle:** `summoned_by` (caster id) + a concentration link;
  `breakConcentration` sweeps `side: 'ally'` summons it owns (mirrors the
  existing banishment/polymorph entity sweeps). `initiative_order` entries
  gain the side so the turn driver knows who acts.

### Turn driver (generalize, don't relocate)
- `selectEnemyMeleeTarget(entity, st)` → `selectTarget(entity, st)`: target
  the **opposite side** (enemy → nearest PC/ally; ally → nearest hostile).
  This is the single most important generalization.
- `attemptEnemyApproach` / `runEnemyMultiattackLoop` / `computeEnemyAttack`:
  parameterize on the *acting* stat block and the *target* `CombatEntity`
  (PC or enemy) instead of hard-coding `enemy` attacker + `Character` target.
  `runEnemyTurns` broadens its "is this an actor I drive?" predicate to
  include `side: 'ally'`.
- **Damage commit:** target-PC → `applyDamage` + `commitCharacter`
  (unchanged); target-enemy/ally → entity HP only (a small
  `applyDamageToEntity` shared with the PC→enemy path in `resolveOneAttack`).

### Content (the visible payoff), once the plumbing lands
1. **Beastmaster companion** — insert an `ally` entity (stat block from the
   beast form) into `entities` + `initiative_order` at combat start.
2. **Spiritual Weapon** — an `ally` entity that only attacks (no approach
   AI; force-spawned adjacent), expires on concentration/duration.
3. **Find Familiar / conjure spells** — cast inserts the `ally` entity;
   concentration sweep removes it.

## Companion control model (layered on top — not blocking)

2024 RAW companions are **player-commanded** (the beast Dodges unless you
spend a Bonus Action to command an action). This only decides *who picks
the target/action*, **not how the attack resolves** (always the stat-block
path). So it's a thin layer over the same plumbing:
- **AI default:** on the companion's turn, auto-pick a target + attack
  (reuse `selectTarget` + the multiattack loop). Simplest; ships first.
- **Player-command (RAW):** a `command_companion { action }` player action
  (already stubbed in `classFeature/paladinRangerBard.ts`) issued on the
  companion's turn; default to Dodge/auto-attack if uncommanded.

Recommend shipping the **AI default first**, adding player-command as a
follow-up. The engine work below is identical either way.

## Implementation plan (vertical slices, each shippable + tested)

- **P4.1 — Side tagging.** Add `CombatEntity.side` (derive from `isEnemy`);
  tag `initiative_order`. `selectEnemyMeleeTarget` → `selectTarget` keyed on
  side. Behavior-preserving for enemies. *Tests: enemy targeting unchanged.*
- **P4.2 — Combatant-agnostic attack helpers.** Rename/parameterize
  `attemptEnemyApproach` / `runEnemyMultiattackLoop` / `computeEnemyAttack`
  from `enemy` → generic acting stat block vs target entity.
  Behavior-preserving for enemies. *Tests: full enemy-turn specs green.*
- **P4.3 — Ally turn driver.** `runEnemyTurns` also drives `side: 'ally'`
  entities (target nearest hostile, reuse approach + multiattack). *Test:
  hand-inserted ally entity takes a turn and damages an enemy.*
- **P4.4 — Summon lifecycle.** Insert/remove ally entities; concentration
  sweep in `breakConcentration`. *Tests: summon appears in initiative,
  vanishes on concentration drop.*
- **P4.5 — Content.** Beastmaster companion → Spiritual Weapon → Find
  Familiar / conjure. Each is data + a spawn hook on the existing patterns.

Each slice is independently revertible, behavior-preserving until P4.3, and
follows the session's commit-per-increment + guard-spec rhythm.

## Explicitly deferred (NOT Phase 4)

- Merging `resolveOneAttack` (PC) and `computeEnemyAttack` (enemy) into one
  actor-agnostic handler.
- Routing enemy/NPC turns through `dispatchAction` (the "helpers become
  registered handlers" vision). Revisit only if a shared PC+monster ability
  (e.g. a monster using Stunning Strike) actually demands it.
- **Phase 5** (drop `ctx.char` / `ctx.safeIdx`) — independent; proceeds for
  PC handlers regardless of this work.

## Open questions for the user

1. **Control model** — AI-driven companions first (simplest), or go straight
   to the RAW player-command model? (Engine plumbing is identical; this is a
   UX/content call.)
2. **Scope of "summons" for the first content slice** — Beastmaster
   companion is the most-requested; is that the right first target, or
   Spiritual Weapon (simpler — no movement AI)?
3. **This revises RE-1's framing** — are you comfortable deferring the full
   dispatcher-merge vision (audit item 5) in favor of the pragmatic path? If
   so, I'll update the TODO to match.
