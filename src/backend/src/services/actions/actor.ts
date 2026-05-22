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

/**
 * Update a PcActor's character with a partial patch, keeping
 * `ctx.actor.char` and `ctx.char` in lockstep. The Phase 1 type
 * seam left `ctx.char` and `ctx.actor.char` referencing the same
 * Character at handler entry; after a `ctx.char = {...ctx.char, ...}`
 * reassignment they would diverge. This helper rewrites both fields
 * to the same new object so handlers can migrate to actor-first
 * reads without introducing staleness bugs.
 *
 * No-op when `ctx.actor.kind !== 'pc'` (enemy actors don't have a
 * Character; their data lives on `ctx.actor.enemy`). Returns the
 * updated character for fluent reads.
 *
 * Pattern for migrated handlers:
 *
 *   if (ctx.actor.kind !== 'pc') return { rejected: '...' };
 *   const { char } = ctx.actor;
 *   updatePcActor(ctx, {
 *     turn_actions: { ...char.turn_actions, dodging: true },
 *   });
 */
export function updatePcActor(
  ctx: { char: Character; actor: Actor },
  patch: Partial<Character>
): Character | null {
  if (ctx.actor.kind !== 'pc') return null;
  const updated = { ...ctx.actor.char, ...patch };
  ctx.actor.char = updated;
  ctx.char = updated;
  return updated;
}
