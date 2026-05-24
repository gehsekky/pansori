import type { ActionHandler } from './types.js';
import { resolveEnemySpell } from '../gameEngine.js';

/**
 * `enemy_cast` (EE-3): an enemy damage spell resolving against a PC,
 * dispatched with an `enemyActor` after the Counterspell window has been
 * cleared by the orchestrator (`attemptEnemySpellCast`). Thin wrapper over
 * `resolveEnemySpell` (the shared enemy-spell resolver) — it resolves the
 * spell, commits the damaged target into `ctx.st`, and appends the cast
 * narrative. The caller reads the updated target back out of `ctx.st`.
 */
export const handleEnemyCast: ActionHandler<{
  type: 'enemy_cast';
  spellId: string;
  targetCharId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'enemy') return { rejected: 'enemy_cast requires an enemy actor.' };
  const { enemy } = ctx.actor;
  const spell = ctx.context.spellTable?.[action.spellId];
  if (!spell?.damage) return { rejected: 'enemy_cast: spell has no damage.' };
  const target = ctx.st.characters.find((c) => c.id === action.targetCharId);
  if (!target) return { rejected: 'enemy_cast: target not found.' };

  const result = resolveEnemySpell({ enemy, spell, target, st: ctx.st, narrative: ctx.narrative });
  ctx.st = result.st;
  ctx.narrative = result.narrative;
};
