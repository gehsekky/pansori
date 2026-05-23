import { ACTION_COSTS, checkBudget, deductCost } from './cost.js';
import type { ActionContext, ActionHandler } from './types.js';
import { handleAcceptQuest, handleCompleteQuest } from './quest.js';
import {
  handleApplyAsi,
  handleLevelUpClass,
  handlePrepareSpells,
  handleSelectSubclass,
  handleSetActiveCharacter,
  handleTakeFeat,
} from './meta.js';
import {
  handleAttackNpc,
  handleBuy,
  handleInfluence,
  handleStudy,
  handleTalk,
  handleTalkResponse,
} from './social.js';
import { handleAttune, handleDeAttune, handleUse } from './inventory.js';
import {
  handleDash,
  handleDisengage,
  handleDodge,
  handleHelp,
  handleReady,
  handleSpendInspiration,
  handleStandUp,
  handleToggleSharpshooter,
  handleUseLuck,
} from './combatUtility.js';
import { handleEndTurn, handlePass } from './utility.js';
import { handleEnterDistrict, handleTravel } from './travel.js';
import { handleGrapple, handleShove, handleTryEscapeGrapple } from './combatTactical.js';
import { handleLongRest, handleShortRest } from './rest.js';
import { handleResolveReaction, handleUseReaction } from './reaction.js';
import { handleUseHealerKit, handleUseHealingHands } from './healActions.js';
import type { StructuredAction } from '../../types.js';
import { handleAttack } from './attack/index.js';
import { handleCastSpell } from './castSpell/index.js';
import { handleCelestialRevelation } from './celestialRevelation.js';
import { handleDeathSave } from './deathSave.js';
import { handleDisarmTrap } from './disarmTrap.js';
import { handleEkWarMagicAttack } from './ekWarMagicAttack.js';
import { handleEscape } from './escape.js';
import { handleExamine } from './examineDefault.js';
import { handleGridMove } from './gridMove.js';
import { handleGwmBonusAttack } from './gwmBonusAttack.js';
import { handleHandOfHealing } from './handOfHealing.js';
import { handleHealingLight } from './healingLight.js';
import { handleInteractObject } from './interactObject.js';
import { handleLandsAid } from './landsAid.js';
import { handleLoot } from './loot.js';
import { handleMove } from './move.js';
import { handlePolearmButtEnd } from './polearmButtEnd.js';
import { handleSneak } from './sneak.js';
import { handleTwoWeaponAttack } from './twoWeaponAttack.js';
import { handleUseClassFeature } from './classFeature/index.js';

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
  use_luck: handleUseLuck as ActionHandler,
  toggle_sharpshooter: handleToggleSharpshooter as ActionHandler,
  stand_up: handleStandUp as ActionHandler,
  dodge: handleDodge as ActionHandler,
  disengage: handleDisengage as ActionHandler,
  dash: handleDash as ActionHandler,
  help: handleHelp as ActionHandler,
  ready: handleReady as ActionHandler,
  apply_asi: handleApplyAsi as ActionHandler,
  level_up_class: handleLevelUpClass as ActionHandler,
  take_feat: handleTakeFeat as ActionHandler,
  select_subclass: handleSelectSubclass as ActionHandler,
  set_active_character: handleSetActiveCharacter as ActionHandler,
  prepare_spells: handlePrepareSpells as ActionHandler,
  escape: handleEscape as ActionHandler,
  attune: handleAttune as ActionHandler,
  de_attune: handleDeAttune as ActionHandler,
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
  attack_npc: handleAttackNpc as ActionHandler,
  influence: handleInfluence as ActionHandler,
  study: handleStudy as ActionHandler,
  use_reaction: handleUseReaction as ActionHandler,
  two_weapon_attack: handleTwoWeaponAttack as ActionHandler,
  polearm_butt_end: handlePolearmButtEnd as ActionHandler,
  gwm_bonus_attack: handleGwmBonusAttack as ActionHandler,
  ek_war_magic_attack: handleEkWarMagicAttack as ActionHandler,
  use_healing_light: handleHealingLight as ActionHandler,
  use_hand_of_healing: handleHandOfHealing as ActionHandler,
  use_lands_aid: handleLandsAid as ActionHandler,
  use_celestial_revelation: handleCelestialRevelation as ActionHandler,
  use_healer_kit: handleUseHealerKit as ActionHandler,
  use_healing_hands: handleUseHealingHands as ActionHandler,
  grid_move: handleGridMove as ActionHandler,
  resolve_reaction: handleResolveReaction as ActionHandler,
  attack: handleAttack as ActionHandler,
  cast_spell: handleCastSpell as ActionHandler,
  use_class_feature: handleUseClassFeature as ActionHandler,
};

/**
 * Result of attempting to dispatch an action.
 *
 * - `handled: false` — no handler registered; caller (takeAction) falls
 *   back to the inline legacy switch.
 * - `handled: true, replaceWith: undefined` — a leaf handler ran;
 *   caller proceeds with the post-action epilogue using the mutated ctx.
 * - `handled: true, replaceWith: <action>` — a transformer wants to
 *   replace the original action. Caller (takeAction) must re-enter
 *   from the top with the new action AND the pre-mutated state (so
 *   stages applied by the transformer survive). The outer epilogue is
 *   skipped because the recursive takeAction will run its own.
 */
export interface DispatchResult {
  handled: boolean;
  replaceWith?: StructuredAction;
}

/**
 * Dispatch `action` against the registered handler. Resolves the
 * handler's return:
 *
 * - void → leaf; return handled=true.
 * - { replaceWith } → bubble up; caller decides how to re-enter.
 * - { delegateTo } → save outer narrative as prefix, dispatch inner
 *   against the same ctx, prepend prefix to ctx.narrative. If the
 *   inner returns replaceWith, iterate locally (re-dispatch the new
 *   action against the same ctx) until the chain bottoms out at a
 *   leaf — only the *outermost* replaceWith should bubble to
 *   takeAction; nested ones are an implementation detail of the
 *   delegate's resolution.
 */
export async function dispatchAction(
  ctx: ActionContext,
  action: StructuredAction
): Promise<DispatchResult> {
  const h = handlers[action.type] as ActionHandler | undefined;
  if (!h) return { handled: false };

  // Action-economy pre-check. For declared-cost handlers, reject early
  // when the budget is exhausted so handlers don't repeat the check.
  // 'managed' handlers (variable cost, free actions, transformers) opt out.
  const cost = ACTION_COSTS[action.type] ?? 'managed';
  const budgetErr = checkBudget(ctx.char, cost);
  if (budgetErr) {
    ctx.narrative = budgetErr;
    return { handled: true };
  }

  const result = await h(ctx, action);

  if (result != null && 'rejected' in result) {
    // Validation failed mid-handler. Set the narrative and skip the
    // post-deduct so the player's action slot survives.
    ctx.narrative = result.rejected;
    return { handled: true };
  }

  if (result != null && 'replaceWith' in result) {
    // Bubble up — the re-dispatched action runs its own pre-check + deduct.
    // Skip outer deduct to avoid double-counting.
    return { handled: true, replaceWith: result.replaceWith };
  }

  if (result != null && 'delegateTo' in result) {
    const prefix = ctx.narrative;
    ctx.narrative = '';
    let nextAction: StructuredAction = result.delegateTo;
    // Resolve replaceWith chains internally — only the *outer* handler's
    // replaceWith bubbles to takeAction. Iterating here means delegating
    // to a transformer (e.g. delegateTo an attack_npc) still resolves
    // fully without bubbling out of the delegate.
    while (true) {
      const inner = await dispatchAction(ctx, nextAction);
      if (!inner.replaceWith) break;
      nextAction = inner.replaceWith;
    }
    ctx.narrative = prefix + ctx.narrative;
    // Outer cost (e.g. 'reaction' for use_reaction) still deducts; the
    // inner action paid its own cost during the nested dispatch.
    ctx.char = deductCost(ctx.char, cost);
    return { handled: true };
  }

  // Leaf handler returned void — deduct the declared cost (no-op for 'managed').
  ctx.char = deductCost(ctx.char, cost);
  return { handled: true };
}

export type { ActionContext, ActionHandler } from './types.js';
