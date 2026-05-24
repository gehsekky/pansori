// `Actor` — discriminated union of the two entity kinds that can
// invoke a handler. Today only PCs do; enemy-side actions still run
// through `runEnemyTurns` and its extracted helpers (see architecture
// audit #5 in docs/TODO.md). `ctx.actor` is now the single source of
// truth for who is acting — handlers narrow `ctx.actor.kind === 'pc'`
// and read `ctx.actor.char`; the legacy `ctx.char` / `ctx.safeIdx`
// mirror fields were removed in Phase 5.
//
// Migration roadmap (RE-1) — all phases shipped:
//   - Phase 1: added the `actor: Actor` field to `ActionContext`.
//   - Phase 2-3: migrated handlers to read `ctx.actor` (narrowed),
//     one tier at a time.
//   - Phase 4: summons/companions act as `side: 'ally'` combatants via
//     the enemy-turn loop (the dispatcher-integrated enemy path is a
//     documented deferral, not required for the SRD engine).
//   - Phase 5: dropped `ctx.char` / `ctx.safeIdx`; every handler reads
//     from `ctx.actor`. Shared abilities can now work for PCs and
//     monsters from one implementation.

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
 * Update a PcActor's character with a partial patch. Rewrites
 * `ctx.actor.char` to a new object that merges the patch over the
 * current character — the single source of truth for the acting PC
 * (the legacy `ctx.char` mirror was dropped in Phase 5). Reads through
 * `ctx.actor.char` (or a `const pc = ctx.actor` binding) stay fresh
 * after the rewrite.
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
export function updatePcActor(ctx: { actor: Actor }, patch: Partial<Character>): Character | null {
  if (ctx.actor.kind !== 'pc') return null;
  const updated = { ...ctx.actor.char, ...patch };
  ctx.actor.char = updated;
  return updated;
}
