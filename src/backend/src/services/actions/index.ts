import type { ActionContext, ActionHandler } from './types.js';
import {
  handleApplyAsi,
  handlePrepareSpells,
  handleSelectSubclass,
  handleSetActiveCharacter,
} from './meta.js';
import { handleBuy, handleTalk, handleTalkResponse } from './social.js';
import {
  handleDash,
  handleDisengage,
  handleDodge,
  handleHelp,
  handleReady,
  handleSpendInspiration,
  handleStandUp,
} from './combatUtility.js';
import { handleEndTurn, handlePass } from './utility.js';
import { handleLongRest, handleShortRest } from './rest.js';
import type { StructuredAction } from '../../types.js';
import { handleAttune } from './inventory.js';
import { handleDeathSave } from './deathSave.js';
import { handleEscape } from './escape.js';

/**
 * Registry of per-action-type handlers. Populated incrementally as the
 * monolithic switch in `takeAction` is decomposed (see docs/CRPG.md for
 * the rationale). PRs land one handler at a time; an action type missing
 * from the registry falls through to the legacy switch in gameEngine.ts.
 */
const handlers: Partial<Record<StructuredAction['type'], ActionHandler>> = {
  pass: handlePass as ActionHandler,
  end_turn: handleEndTurn as ActionHandler,
  spend_inspiration: handleSpendInspiration as ActionHandler,
  stand_up: handleStandUp as ActionHandler,
  dodge: handleDodge as ActionHandler,
  disengage: handleDisengage as ActionHandler,
  dash: handleDash as ActionHandler,
  help: handleHelp as ActionHandler,
  ready: handleReady as ActionHandler,
  apply_asi: handleApplyAsi as ActionHandler,
  select_subclass: handleSelectSubclass as ActionHandler,
  set_active_character: handleSetActiveCharacter as ActionHandler,
  prepare_spells: handlePrepareSpells as ActionHandler,
  escape: handleEscape as ActionHandler,
  attune: handleAttune as ActionHandler,
  short_rest: handleShortRest as ActionHandler,
  long_rest: handleLongRest as ActionHandler,
  death_save: handleDeathSave as ActionHandler,
  talk: handleTalk as ActionHandler,
  talk_response: handleTalkResponse as ActionHandler,
  buy: handleBuy as ActionHandler,
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
