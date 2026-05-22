// `Actor` — discriminated union of the two entity kinds that can
// invoke a handler. Today only PCs do; enemy-side actions still run
// through `runEnemyTurns` and its extracted helpers (see architecture
// audit #5 in docs/TODO.md). This module sets up the type seam so
// future PRs can migrate handlers one at a time to read actor data
// polymorphically instead of assuming `ctx.char` is always a PC.
//
// Migration roadmap (from `ActionContext.actor` JSDoc):
//   - Phase 1 (this PR): add `actor: Actor` field to `ActionContext`.
//     PC turns populate it; enemy turns still bypass the dispatcher.
//     `ctx.char` and `ctx.safeIdx` continue to exist for back-compat.
//   - Phase 2: pilot one handler reading from `ctx.actor` instead of
//     `ctx.char` — start with a small one (e.g. `pass`).
//   - Phase 3: migrate more handlers, one at a time, narrowing
//     `ctx.actor` via discriminant where PC-specific data is needed.
//   - Phase 4: wire enemy turns to invoke `dispatchAction` with an
//     enemy actor. The closure-extracted helpers (`runEnemyMultiattackLoop`
//     etc.) become handlers registered in the dispatcher.
//   - Phase 5: drop `ctx.char` / `ctx.safeIdx` once every handler
//     reads from `ctx.actor`. Shared abilities (Stunning Strike,
//     Divine Smite, ...) work for PCs and monsters from one
//     implementation.

import type { Character, CombatEntity, Enemy } from '../../types.js';

/**
 * A PC acting through the dispatcher. `char` is the live Character
 * (mutated through the handler); `safeIdx` is the matching index in
 * `st.characters` so `commitCharacter` can find the slot.
 */
export interface PcActor {
  kind: 'pc';
  char: Character;
  safeIdx: number;
}

/**
 * An enemy acting through the dispatcher. `enemy` is the seed-level
 * stat block; `ent` is the grid entity (position, mirrored HP) when
 * one exists. `ent` is optional because some enemy-action paths
 * (e.g. legendary follow-ups) currently bypass the grid layer.
 */
export interface EnemyActor {
  kind: 'enemy';
  enemy: Enemy;
  ent?: CombatEntity;
}

export type Actor = PcActor | EnemyActor;

/**
 * Build a PC actor record. Called by `takeAction` when constructing
 * the per-turn `ActionContext`.
 */
export function pcActor(char: Character, safeIdx: number): PcActor {
  return { kind: 'pc', char, safeIdx };
}

/**
 * Build an enemy actor record. Reserved for the dispatcher-integrated
 * enemy-turn path; not currently called from any production code path
 * (Phase 4 of the migration). Exposed now so future PRs can wire it
 * in without churning the type module.
 */
export function enemyActor(enemy: Enemy, ent?: CombatEntity): EnemyActor {
  return { kind: 'enemy', enemy, ent };
}
