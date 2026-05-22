import type { Character, StructuredAction } from '../../types.js';

/**
 * Declarative action-economy cost for each registered action. The
 * dispatcher pre-checks the budget before invoking the handler and
 * post-deducts on success — eliminating the per-handler boilerplate
 * (`if (action_used) { error }` + `turn_actions.action_used = true`)
 * and the latent "forgot to consume" bug class.
 *
 * Cost kinds:
 *
 *   'action'     — consumes the standard action slot. Pre-check
 *                  rejects with "You have already used your action
 *                  this turn." Post-deducts `action_used: true`.
 *   'bonusAction'— consumes the bonus action slot. Same pattern.
 *   'reaction'   — consumes the reaction slot. Same pattern.
 *   'managed'    — handler does its own bookkeeping. Dispatcher does
 *                  nothing. Used by:
 *                    • variable-cost handlers (`cast_spell` may be
 *                      action OR bonus, `use_class_feature` varies per
 *                      feature, `attack` is free under Extra Attack,
 *                      `two_weapon_attack` depends on Nick property),
 *                    • multi-step handlers that pay the cost at a
 *                      specific point in their logic (e.g. consumable
 *                      use that becomes bonus-or-action based on item),
 *                    • free actions (`pass`, `examine`, `move`, etc.)
 *                      that don't touch action economy at all.
 *
 * Replace-with transformers (`attack_npc → attack`) keep 'managed'
 * because the bubbled-up action pays its own cost when re-dispatched.
 *
 * Delegate-to wrappers (`use_reaction → readied action`) declare the
 * outer cost ('reaction') so the dispatcher deducts the reaction
 * slot; the inner action pays whatever its own cost declaration says
 * when delegateTo's nested dispatchAction call runs.
 */
export type ActionCost = 'action' | 'bonusAction' | 'reaction' | 'managed';

export const ACTION_COSTS: Record<StructuredAction['type'], ActionCost> = {
  // Fixed action-cost handlers — dispatcher pre-checks + post-deducts.
  // Validation early-exits return `{ rejected: ... }` to skip deduction;
  // post-validation failure paths (e.g. shove vs prone-immune target)
  // return void so the cost lands (RAW: the action was committed).
  dodge: 'action',
  disengage: 'action',
  dash: 'action',
  help: 'action',
  ready: 'action',
  sneak: 'action',
  disarm_trap: 'action',
  grapple: 'action',
  shove: 'action',
  try_escape_grapple: 'action',

  // Reaction-cost handlers.
  use_reaction: 'reaction',

  // Everything else stays self-managed.
  // Free / variable / out-of-combat — handler manages itself.
  pass: 'managed',
  end_turn: 'managed',
  spend_inspiration: 'managed',
  use_luck: 'managed',
  toggle_sharpshooter: 'managed',
  level_up_class: 'managed',
  stand_up: 'managed',
  apply_asi: 'managed',
  take_feat: 'managed',
  select_subclass: 'managed',
  set_active_character: 'managed',
  prepare_spells: 'managed',
  escape: 'managed',
  attune: 'managed',
  de_attune: 'managed',
  short_rest: 'managed',
  long_rest: 'managed',
  death_save: 'managed',
  talk: 'managed',
  talk_response: 'managed',
  buy: 'managed',
  travel: 'managed',
  enter_district: 'managed',
  accept_quest: 'managed',
  complete_quest: 'managed',
  move: 'managed',
  loot: 'managed',
  use: 'managed',
  interact_object: 'managed',
  examine: 'managed',
  attack_npc: 'managed',
  influence: 'managed',
  study: 'managed',
  two_weapon_attack: 'managed',
  polearm_butt_end: 'managed',
  gwm_bonus_attack: 'managed',
  ek_war_magic_attack: 'managed',
  use_healing_light: 'managed',
  use_hand_of_healing: 'managed',
  use_lands_aid: 'managed',
  use_mantle_of_inspiration: 'managed',
  use_celestial_revelation: 'managed',
  use_healer_kit: 'managed',
  use_healing_hands: 'managed',
  grid_move: 'managed',
  resolve_reaction: 'managed',
  attack: 'managed',
  cast_spell: 'managed',
  use_class_feature: 'managed',
};

const BUDGET_ERRORS: Record<Exclude<ActionCost, 'managed'>, string> = {
  action: 'You have already used your action this turn.',
  bonusAction: 'You have already used your bonus action this turn.',
  reaction: 'You have already used your reaction this turn.',
};

/**
 * If `cost` would exceed `char`'s remaining budget, returns the user-
 * facing narrative explaining why. Otherwise returns `null` (proceed).
 */
export function checkBudget(char: Character, cost: ActionCost): string | null {
  if (cost === 'managed') return null;
  const flags = char.turn_actions;
  if (cost === 'action' && flags?.action_used) return BUDGET_ERRORS.action;
  if (cost === 'bonusAction' && flags?.bonus_action_used) return BUDGET_ERRORS.bonusAction;
  if (cost === 'reaction' && flags?.reaction_used) return BUDGET_ERRORS.reaction;
  return null;
}

/**
 * Returns a new Character with the relevant action-economy flag set.
 * No-op for 'managed' (handler did its own bookkeeping).
 */
export function deductCost(char: Character, cost: ActionCost): Character {
  if (cost === 'managed') return char;
  const turn = char.turn_actions ?? {};
  switch (cost) {
    case 'action':
      return { ...char, turn_actions: { ...turn, action_used: true } };
    case 'bonusAction':
      return { ...char, turn_actions: { ...turn, bonus_action_used: true } };
    case 'reaction':
      return { ...char, turn_actions: { ...turn, reaction_used: true } };
  }
}
