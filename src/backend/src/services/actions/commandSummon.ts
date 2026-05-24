import { entitySide, getEnemyById } from '../gameEngine.js';
import type { ActionHandler } from './types.js';

/**
 * `command_summon`: RAW player-command for a summoned creature (e.g.
 * Animate Dead's "you can use a bonus action to mentally command any
 * creature you made with this spell"). On the owner's turn, spend a
 * bonus action to direct one of your summons to attack a chosen enemy.
 *
 * Records `commanded_target_id` on the summon entity. The ally-turn AI
 * (`selectTarget` / `runAllyTurn`) prefers that target while the enemy
 * lives, falling back to the nearest-enemy default once it dies — so a
 * command persists until the target drops or you re-issue it, rather
 * than needing a fresh command every round.
 *
 * The bonus-action cost is declared in `ACTION_COSTS` (the dispatcher
 * pre-checks the budget and post-deducts); this handler only validates
 * and writes the target. It does NOT set `usedInitiative` — commanding
 * is a bonus action, so the owner keeps their action and movement.
 * (RE-1 Phase 4.5.)
 */
export const handleCommandSummon: ActionHandler<{
  type: 'command_summon';
  summonId: string;
  targetEnemyId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can command summons.' };
  const { char } = ctx.actor;

  const summon = (ctx.st.entities ?? []).find(
    (e) => e.id === action.summonId && e.summoned_by === char.id && entitySide(e) === 'ally'
  );
  if (!summon) return { rejected: 'No summon of yours to command.' };
  if (summon.hp <= 0) return { rejected: `${summon.companionName ?? 'Your summon'} has fallen.` };

  const targetEnt = (ctx.st.entities ?? []).find(
    (e) => e.id === action.targetEnemyId && entitySide(e) === 'enemy' && e.hp > 0
  );
  if (!targetEnt) return { rejected: 'That target is no longer a valid enemy.' };

  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === summon.id ? { ...e, commanded_target_id: targetEnt.id } : e
    ),
  };

  const summonName = summon.companionName ?? 'your summon';
  const foeName =
    getEnemyById(ctx.seed, targetEnt.id)?.name ?? targetEnt.companionName ?? 'the enemy';
  ctx.narrative = `${char.name} commands ${summonName} to attack ${foeName}.`;
};
