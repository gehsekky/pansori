import type { ActionHandler } from './types.js';

/**
 * `pass`: skip the rest of the turn. RAW (PHB p.189) — a character can
 * always choose to take no action. Special-cases stunned/paralyzed in
 * the narrative so the prose explains *why* the turn was forfeited
 * rather than just announcing it. Marks both the action and bonus
 * action used so the next turn doesn't get an extra bite at the apple.
 */
export const handlePass: ActionHandler<{ type: 'pass' }> = (ctx) => {
  const cond =
    ctx.char.conditions.find((c) => c === 'stunned' || c === 'paralyzed') ?? ctx.char.conditions[0];
  ctx.narrative = cond
    ? `${ctx.char.name} is ${cond} and cannot act. Turn passed.`
    : `${ctx.char.name} passes their turn.`;
  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, action_used: true, bonus_action_used: true },
  };
  ctx.usedInitiative = true;
};

/**
 * `end_turn`: explicit "I'm done" — forfeits remaining movement /
 * bonus-action without claiming a condition forced it. Used by the FE
 * when the player clicks the end-turn button after spending their
 * action but with leftover movement.
 */
export const handleEndTurn: ActionHandler<{ type: 'end_turn' }> = (ctx) => {
  ctx.narrative = `${ctx.char.name} ends their turn.`;
  ctx.usedInitiative = true;
};
