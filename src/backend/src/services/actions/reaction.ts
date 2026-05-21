import type { ActionHandler } from './types.js';

/**
 * `use_reaction`: trigger the readied action stored from a prior
 * `ready` action. Consumes the reaction slot + clears the readied
 * action, then emits a "triggers their readied action!" prefix and
 * delegates to the stored inner action.
 *
 * Returns `delegateTo` — the inner action runs against the same ctx,
 * stacking its mutations on top of the trigger's pre-mutations. The
 * outer takeAction's epilogue runs once (enemy turns, runRules, LLM
 * enhance, etc.) over the combined state. This differs from the
 * pre-refactor behavior which called takeAction recursively — that
 * version ran the epilogue twice (the inner takeAction's, then the
 * outer's), occasionally producing duplicate enemy turns or duplicate
 * LLM costs; the delegate-with-prefix approach resolves it cleanly.
 *
 * resolve_reaction (Shield window / Counterspell window) is a
 * different shape — pending_reaction is set BY a triggering action
 * mid-turn, not stored on the char — and will join this file when
 * extracted.
 */
export const handleUseReaction: ActionHandler<{ type: 'use_reaction' }> = (ctx) => {
  if (ctx.char.turn_actions.reaction_used) {
    ctx.narrative = 'You have already used your reaction this turn.';
    return;
  }
  const readied = ctx.char.turn_actions.readied_action;
  if (!readied) {
    ctx.narrative = 'You have no readied action.';
    return;
  }
  ctx.char = {
    ...ctx.char,
    turn_actions: {
      ...ctx.char.turn_actions,
      reaction_used: true,
      readied_action: undefined,
    },
  };
  ctx.commitChar();
  ctx.narrative = `${ctx.char.name} triggers their readied action! `;
  return { delegateTo: readied.action };
};
