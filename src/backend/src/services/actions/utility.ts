import type { ActionHandler } from './types.js';
import { updatePcActor } from './actor.js';

/**
 * `pass`: skip the rest of the turn. RAW (PHB p.189) — a character can
 * always choose to take no action. Special-cases stunned/paralyzed in
 * the narrative so the prose explains *why* the turn was forfeited
 * rather than just announcing it. Marks both the action and bonus
 * action used so the next turn doesn't get an extra bite at the apple.
 */
export const handlePass: ActionHandler<{ type: 'pass' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can pass a turn.' };
  const { char } = ctx.actor;
  const cond =
    char.conditions.find((c) => c === 'stunned' || c === 'paralyzed') ?? char.conditions[0];
  ctx.narrative = cond
    ? `${char.name} is ${cond} and cannot act. Turn passed.`
    : `${char.name} passes their turn.`;
  updatePcActor(ctx, {
    turn_actions: { ...char.turn_actions, action_used: true, bonus_action_used: true },
  });
  ctx.usedInitiative = true;
};

/**
 * `end_turn`: explicit "I'm done" — forfeits remaining movement /
 * bonus-action without claiming a condition forced it. Used by the FE
 * when the player clicks the end-turn button after spending their
 * action but with leftover movement.
 */
export const handleEndTurn: ActionHandler<{ type: 'end_turn' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can end a turn.' };
  const { char } = ctx.actor;
  ctx.narrative = `${char.name} ends their turn.`;
  ctx.usedInitiative = true;
};

/**
 * `continue`: dismiss the post-combat gate. `endCombatState` left
 * `combat_over_pending` set so the FE showed a "Continue" prompt instead of
 * snapping back to exploration; clearing it returns the normal choices. Pure
 * out-of-combat acknowledgement — no turn economy, no narrative noise.
 */
export const handleContinue: ActionHandler<{ type: 'continue' }> = (ctx) => {
  ctx.st = { ...ctx.st, combat_over_pending: false };
  ctx.narrative = '';
};
