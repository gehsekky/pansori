import { ACTION_COSTS, checkBudget, deductCost } from './cost.js';
import type { ActionContext, ActionHandler } from './types.js';
import { handleAcceptQuest, handleCompleteQuest } from './quest.js';
import {
  handleApplyAsi,
  handleChooseBlessedStrikes,
  handleChooseDivineOrder,
  handleChooseElementalAffinity,
  handleChooseEvocationSavant,
  handleChooseExpertise,
  handleChooseFiendishResilience,
  handleChooseFightingStyle,
  handleChooseHunterOption,
  handleChooseMetamagic,
  handleChooseMysticArcanum,
  handleChooseSignatureSpell,
  handleChooseSpellMastery,
  handleChooseWeaponMastery,
  handleEnterLeveling,
  handleExitLeveling,
  handleLevelUpClass,
  handleMemorizeSpell,
  handlePrepareSpells,
  handleSelectSubclass,
  handleSetActiveCharacter,
  handleTakeFeat,
} from './meta.js';
import {
  handleAttackNpc,
  handleBuy,
  handleConversationBack,
  handleEndConversation,
  handleEnterShop,
  handleExitShop,
  handleInfluence,
  handleStudy,
  handleTalk,
  handleTalkResponse,
} from './social.js';
import { handleAttune, handleDeAttune, handleUse } from './inventory.js';
import { handleContinue, handleEndTurn, handlePass } from './utility.js';
import {
  handleDash,
  handleDisengage,
  handleDodge,
  handleHelp,
  handleReady,
  handleSpendInspiration,
  handleStandUp,
} from './combatUtility.js';
import { handleDismount, handleMount } from './mount.js';
import { handleGrapple, handleShove, handleTryEscapeGrapple } from './combatTactical.js';
import { handleLongRest, handleShortRest } from './rest.js';
import { handleResolveReaction, handleUseReaction } from './reaction.js';
import type { StructuredAction } from '../../types.js';
import { handleApproach } from './approach.js';
import { handleAttack } from './attack/index.js';
import { handleCastSpell } from './castSpell/index.js';
import { handleCommandSummon } from './commandSummon.js';
import { handleDeathSave } from './deathSave.js';
import { handleDisarmTrap } from './disarmTrap.js';
import { handleEnemyAttack } from './enemyAttack.js';
import { handleEnemyCast } from './enemyCast.js';
import { handleEnemyMove } from './enemyMove.js';
import { handleExamine } from './examineDefault.js';
import { handleGridMove } from './gridMove.js';
import { handleHasteExtraAction } from './hasteExtraAction.js';
import { handleHide } from './hide.js';
import { handleInteractObject } from './interactObject.js';
import { handleJump } from './jump.js';
import { handleLandsAid } from './landsAid.js';
import { handleLayOnHands } from './layOnHands.js';
import { handleLoot } from './loot.js';
import { handleMarkerMove } from './markerMove.js';
import { handleMoveZone } from './moveZone.js';
import { handleRecoverSlots } from './recoverSlots.js';
import { handleRecurringSpellAttack } from './recurringSpellAttack.js';
import { handleSetPace } from './setPace.js';
import { handleSneak } from './sneak.js';
import { handleThrowItem } from './throwItem.js';
import { handleTwoWeaponAttack } from './twoWeaponAttack.js';
import { handleUseBreath } from './useBreath.js';
import { handleUseClassFeature } from './classFeature/index.js';

/**
 * Registry of per-action-type handlers. Populated incrementally as the
 * monolithic switch in `takeAction` is decomposed. PRs land one handler
 * at a time; an action type missing from the registry falls through to
 * the legacy switch in gameEngine.ts.
 */
const handlers: Partial<Record<StructuredAction['type'], ActionHandler>> = {
  pass: handlePass as ActionHandler,
  end_turn: handleEndTurn as ActionHandler,
  continue: handleContinue as ActionHandler,
  spend_inspiration: handleSpendInspiration as ActionHandler,
  stand_up: handleStandUp as ActionHandler,
  dodge: handleDodge as ActionHandler,
  disengage: handleDisengage as ActionHandler,
  hide: handleHide as ActionHandler,
  dash: handleDash as ActionHandler,
  help: handleHelp as ActionHandler,
  ready: handleReady as ActionHandler,
  recurring_spell_attack: handleRecurringSpellAttack as ActionHandler,
  use_breath: handleUseBreath as ActionHandler,
  apply_asi: handleApplyAsi as ActionHandler,
  level_up_class: handleLevelUpClass as ActionHandler,
  enter_leveling: handleEnterLeveling as ActionHandler,
  exit_leveling: handleExitLeveling as ActionHandler,
  take_feat: handleTakeFeat as ActionHandler,
  select_subclass: handleSelectSubclass as ActionHandler,
  choose_fighting_style: handleChooseFightingStyle as ActionHandler,
  choose_expertise: handleChooseExpertise as ActionHandler,
  choose_weapon_mastery: handleChooseWeaponMastery as ActionHandler,
  choose_hunter_option: handleChooseHunterOption as ActionHandler,
  choose_metamagic: handleChooseMetamagic as ActionHandler,
  choose_elemental_affinity: handleChooseElementalAffinity as ActionHandler,
  choose_blessed_strikes: handleChooseBlessedStrikes as ActionHandler,
  choose_divine_order: handleChooseDivineOrder as ActionHandler,
  choose_spell_mastery: handleChooseSpellMastery as ActionHandler,
  choose_signature_spell: handleChooseSignatureSpell as ActionHandler,
  choose_evocation_savant: handleChooseEvocationSavant as ActionHandler,
  choose_fiendish_resilience: handleChooseFiendishResilience as ActionHandler,
  choose_mystic_arcanum: handleChooseMysticArcanum as ActionHandler,
  memorize_spell: handleMemorizeSpell as ActionHandler,
  lay_on_hands: handleLayOnHands as ActionHandler,
  set_active_character: handleSetActiveCharacter as ActionHandler,
  prepare_spells: handlePrepareSpells as ActionHandler,
  attune: handleAttune as ActionHandler,
  de_attune: handleDeAttune as ActionHandler,
  short_rest: handleShortRest as ActionHandler,
  long_rest: handleLongRest as ActionHandler,
  recover_slots: handleRecoverSlots as ActionHandler,
  death_save: handleDeathSave as ActionHandler,
  talk: handleTalk as ActionHandler,
  talk_response: handleTalkResponse as ActionHandler,
  conversation_back: handleConversationBack as ActionHandler,
  end_conversation: handleEndConversation as ActionHandler,
  buy: handleBuy as ActionHandler,
  enter_shop: handleEnterShop as ActionHandler,
  exit_shop: handleExitShop as ActionHandler,
  marker_move: handleMarkerMove as ActionHandler,
  set_pace: handleSetPace as ActionHandler,
  approach: handleApproach as ActionHandler,
  accept_quest: handleAcceptQuest as ActionHandler,
  complete_quest: handleCompleteQuest as ActionHandler,
  grapple: handleGrapple as ActionHandler,
  try_escape_grapple: handleTryEscapeGrapple as ActionHandler,
  shove: handleShove as ActionHandler,
  move_zone: handleMoveZone as ActionHandler,
  loot: handleLoot as ActionHandler,
  sneak: handleSneak as ActionHandler,
  disarm_trap: handleDisarmTrap as ActionHandler,
  use: handleUse as ActionHandler,
  throw_item: handleThrowItem as ActionHandler,
  interact_object: handleInteractObject as ActionHandler,
  examine: handleExamine as ActionHandler,
  attack_npc: handleAttackNpc as ActionHandler,
  influence: handleInfluence as ActionHandler,
  study: handleStudy as ActionHandler,
  use_reaction: handleUseReaction as ActionHandler,
  two_weapon_attack: handleTwoWeaponAttack as ActionHandler,
  use_lands_aid: handleLandsAid as ActionHandler,
  grid_move: handleGridMove as ActionHandler,
  mount: handleMount as ActionHandler,
  dismount: handleDismount as ActionHandler,
  jump: handleJump as ActionHandler,
  resolve_reaction: handleResolveReaction as ActionHandler,
  attack: handleAttack as ActionHandler,
  cast_spell: handleCastSpell as ActionHandler,
  use_class_feature: handleUseClassFeature as ActionHandler,
  haste_extra_action: handleHasteExtraAction as ActionHandler,
  command_summon: handleCommandSummon as ActionHandler,
  enemy_attack: handleEnemyAttack as ActionHandler,
  enemy_cast: handleEnemyCast as ActionHandler,
  enemy_move: handleEnemyMove as ActionHandler,
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
  const budgetErr = ctx.actor.kind === 'pc' ? checkBudget(ctx.actor.char, cost) : null;
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
    if (ctx.actor.kind === 'pc') ctx.actor.char = deductCost(ctx.actor.char, cost);
    return { handled: true };
  }

  // Leaf handler returned void — deduct the declared cost (no-op for 'managed').
  if (ctx.actor.kind === 'pc') ctx.actor.char = deductCost(ctx.actor.char, cost);
  return { handled: true };
}

export type { ActionContext, ActionHandler } from './types.js';
