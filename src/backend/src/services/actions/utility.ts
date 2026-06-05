import { activeGrid, resolveTransition } from '../mapEngine.js';
import type { ActionHandler } from './types.js';
import { posEqual } from '../gridEngine.js';
import { updatePcActor } from './actor.js';

/**
 * `pass`: skip the rest of the turn. RAW (SRD) — a character can
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
  // Drop the post-combat battlefield kept on screen for the gate (wilderness
  // encounters — see endCombatState) as we return to exploration.
  ctx.st = { ...ctx.st, combat_over_pending: false, entities: undefined };
  ctx.narrative = '';
  // A wilderness ambush interrupts travel BEFORE the destination transition
  // resolves (resolveMarkerMove skips the transition when an encounter fires),
  // so the party returns from combat parked ON the site cell with no room
  // entered — and can't re-enter it ("already there"). If the cell they were
  // heading to is a transition (a town / POI / room exit), descend into it now
  // so Continue lands them in the place they were travelling to.
  if (ctx.st.map_level && !ctx.st.current_room && ctx.st.marker_pos) {
    const grid = activeGrid(ctx.context.campaign, ctx.seed.rooms, ctx.st);
    const marker = ctx.st.marker_pos;
    const transition = grid?.transitions.find((t) => posEqual(t.pos, marker));
    if (transition) {
      const res = resolveTransition(ctx.context.campaign, ctx.seed.rooms, ctx.st, transition);
      ctx.st = res.st;
      ctx.narrative = res.narrative;
    }
  }
};
