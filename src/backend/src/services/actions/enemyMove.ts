import type { ActionHandler } from './types.js';
import { attemptEnemyApproach } from '../gameEngine.js';

/**
 * `enemy_move` (EE-4): an enemy's approach step toward a PC before its
 * attack — path-plan, opportunity attacks from squares it leaves, and the
 * position commit. Dispatched with an `enemyActor`. Thin wrapper over
 * `attemptEnemyApproach` (the shared movement resolver): it runs the
 * approach, writes the updated state + narrative onto `ctx`, and reports
 * the outcome (proceed-to-attack vs skip-turn, + whether the turn header
 * was printed) on `ctx.enemyApproach` for the enemy-turn loop to act on.
 */
export const handleEnemyMove: ActionHandler<{
  type: 'enemy_move';
  targetCharId: string;
  resumeMi: number;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'enemy') return { rejected: 'enemy_move requires an enemy actor.' };
  const { enemy } = ctx.actor;
  const target = ctx.st.characters.find((c) => c.id === action.targetCharId);
  if (!target) return { rejected: 'enemy_move: target not found.' };
  const roomObstacleCells =
    ctx.seed.rooms.find((r) => r.id === ctx.st.current_room)?.obstacles ?? [];

  const result = attemptEnemyApproach({
    enemy,
    enemyId: enemy.id,
    target,
    st: ctx.st,
    resumeMi: action.resumeMi,
    context: ctx.context,
    roomObstacleCells,
    narrative: ctx.narrative,
  });
  ctx.st = result.st;
  ctx.narrative = result.narrative;
  ctx.enemyApproach = {
    kind: result.kind,
    movementHeaderPrinted: result.kind === 'proceed-to-attack' ? result.movementHeaderPrinted : false,
  };
};
