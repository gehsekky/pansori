import type { ActionHandler } from './types.js';
import { resolveEnemySubAttack } from '../gameEngine.js';

/**
 * `enemy_attack` (EE-2): one enemy sub-attack against a PC, dispatched
 * with an `enemyActor` so the enemy turn runs through the same
 * dispatcher as PC actions. Thin wrapper over `resolveEnemySubAttack`
 * (the shared per-attack core) — it resolves the swing, writes the
 * updated state + narrative onto `ctx`, and reports the tagged result
 * via `ctx.enemySubAttack` for the multiattack loop to act on (pause /
 * massive-death / continue). The post-attack death-save + commit stay
 * in `runEnemyTurns`, so this handler must NOT commit the target.
 */
export const handleEnemyAttack: ActionHandler<{
  type: 'enemy_attack';
  targetCharId: string;
  advIdx: number;
  multiattackIdx: number;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'enemy') return { rejected: 'enemy_attack requires an enemy actor.' };
  const { enemy, ent } = ctx.actor;
  const target = ctx.st.characters.find((c) => c.id === action.targetCharId);
  if (!target) return { rejected: 'enemy_attack: target not found.' };

  const result = resolveEnemySubAttack({
    enemy,
    enemyId: enemy.id,
    enemyEnt: ent,
    target,
    st: ctx.st,
    context: ctx.context,
    advIdx: action.advIdx,
    mi: action.multiattackIdx,
    narrative: ctx.narrative,
  });
  ctx.st = result.st;
  ctx.narrative = result.narrative;
  ctx.enemySubAttack = result;
};
