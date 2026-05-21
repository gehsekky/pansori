import type { ActionContext, ActionHandler } from './types.js';
import { handleAcceptQuest, handleCompleteQuest } from './quest.js';
import {
  handleApplyAsi,
  handlePrepareSpells,
  handleSelectSubclass,
  handleSetActiveCharacter,
} from './meta.js';
import { handleAttune, handleUse } from './inventory.js';
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
import { handleEnterDistrict, handleTravel } from './travel.js';
import { handleGrapple, handleShove, handleTryEscapeGrapple } from './combatTactical.js';
import { handleLongRest, handleShortRest } from './rest.js';
import type { StructuredAction } from '../../types.js';
import { handleDeathSave } from './deathSave.js';
import { handleDisarmTrap } from './disarmTrap.js';
import { handleEscape } from './escape.js';
import { handleExamine } from './examineDefault.js';
import { handleInteractObject } from './interactObject.js';
import { handleLoot } from './loot.js';
import { handleMove } from './move.js';
import { handleSneak } from './sneak.js';

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
  travel: handleTravel as ActionHandler,
  enter_district: handleEnterDistrict as ActionHandler,
  accept_quest: handleAcceptQuest as ActionHandler,
  complete_quest: handleCompleteQuest as ActionHandler,
  grapple: handleGrapple as ActionHandler,
  try_escape_grapple: handleTryEscapeGrapple as ActionHandler,
  shove: handleShove as ActionHandler,
  move: handleMove as ActionHandler,
  loot: handleLoot as ActionHandler,
  sneak: handleSneak as ActionHandler,
  disarm_trap: handleDisarmTrap as ActionHandler,
  use: handleUse as ActionHandler,
  interact_object: handleInteractObject as ActionHandler,
  examine: handleExamine as ActionHandler,
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
