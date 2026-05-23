import type { ActionHandler } from './types.js';

/**
 * SRD 5.2.1 Haste — "It gains an additional action on each of its
 * turns. That action can be used only to take the Attack (one weapon
 * attack only), Dash, Disengage, Hide, or Utilize action."
 *
 * Pansori models this as a wrapper that:
 *  1. Validates the caster is hasted and the extra slot is unspent.
 *  2. Marks the extra slot consumed (`haste_extra_action_used = true`).
 *  3. Clears `action_used` so the inner handler's gate passes when it
 *     runs through `dispatchAction`. The inner handler will set
 *     `action_used = true` again at the end — that's fine since the
 *     normal action was already spent before this wrapper fired.
 *  4. Delegates to the inner action via `delegateTo`. The dispatcher
 *     re-enters with the inner type; the inner handler sees the
 *     un-gated state and runs normally.
 *
 * The choice generator is responsible for only surfacing this wrapper
 * when the prerequisites are met (hasted + action_used +
 * !haste_extra_action_used). Defensive checks here protect against
 * direct API calls that bypass the choice generator.
 *
 * Deferrals:
 *  - RAW "Attack (one weapon attack only)" — pansori's Extra Attack
 *    still fires on the wrapped Attack today, mildly overpowering
 *    Hasted fighters. A future fix would thread a "single attack"
 *    flag through the attack pipeline that gates the Extra Attack
 *    loop when set.
 *  - RAW Utilize is the "interact with an object" action; pansori's
 *    closest mapping is `interact_object`. Players using this for
 *    Utilize is opt-in via the choice menu.
 */
export const handleHasteExtraAction: ActionHandler<{
  type: 'haste_extra_action';
  inner:
    | { type: 'attack'; targetEnemyId?: string }
    | { type: 'dash' }
    | { type: 'disengage' }
    | { type: 'sneak' }
    | { type: 'interact_object'; objectId: string };
}> = (ctx, action) => {
  if (!ctx.char.conditions.includes('hasted')) {
    return { rejected: 'You are not Hasted.' };
  }
  if (ctx.char.turn_actions.haste_extra_action_used) {
    return { rejected: 'You have already used your Haste extra action this turn.' };
  }
  ctx.char = {
    ...ctx.char,
    turn_actions: {
      ...ctx.char.turn_actions,
      action_used: false,
      haste_extra_action_used: true,
    },
  };
  ctx.narrative = `${ctx.char.name} surges with Haste — extra action! `;
  return { delegateTo: action.inner };
};
