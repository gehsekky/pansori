import type { ActionContext, ActionHandler } from './types.js';
import { handleEndTurn, handlePass } from './utility.js';
import type { StructuredAction } from '../../types.js';

/**
 * Registry of per-action-type handlers. Populated incrementally as the
 * monolithic switch in `takeAction` is decomposed (see docs/CRPG.md for
 * the rationale). PRs land one handler at a time; an action type missing
 * from the registry falls through to the legacy switch in gameEngine.ts.
 */
const handlers: Partial<Record<StructuredAction['type'], ActionHandler>> = {
  pass: handlePass as ActionHandler,
  end_turn: handleEndTurn as ActionHandler,
};

/**
 * Look up and invoke the handler for `action.type`. Returns `true` if a
 * handler ran (caller skips the legacy switch); `false` if no handler is
 * registered (caller falls back to the inline switch).
 */
export async function dispatchAction(
  ctx: ActionContext,
  action: StructuredAction
): Promise<boolean> {
  const h = handlers[action.type] as ActionHandler | undefined;
  if (!h) return false;
  await h(ctx, action);
  return true;
}

export type { ActionContext, ActionHandler } from './types.js';
