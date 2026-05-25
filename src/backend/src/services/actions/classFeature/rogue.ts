import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { effectiveSpeed } from '../../gameEngine.js';
import { resolveHideAttempt } from '../hide.js';

/**
 * Rogue features. All gated by class === 'rogue' and level >= 2 (Cunning
 * Action) or level >= 5 (Cunning Strike).
 *
 *  - `cunning_action_dash`: bonus action, +effectiveSpeed of movement
 *    this turn (refunds movement_used by speed).
 *  - `cunning_action_disengage`: bonus action, sets `disengaged` so
 *    grid_move skips opportunity-attack triggers this turn.
 *  - `cunning_action_hide`: bonus action. SRD 5.2.1 Hide [Action] — gated on
 *    the obscurement/cover + out-of-line-of-sight prerequisite
 *    (`canAttemptHide`), then a flat DC 15 Dexterity (Stealth) check (NOT
 *    contested vs passive Perception — that was the 2014 model). Success sets
 *    `invisible` and stores hide_dc (the check total) for enemies to beat with
 *    Perception/Search. Heavy encumbrance applies disadv; Halfling species
 *    gets the Lucky reroll.
 *  - `cunning_strike_{trip|poison|withdraw|disarm}`: L5+. Pre-commits
 *    an effect on the next Sneak Attack (consumed in attack.ts).
 */
export function handleRogueFeature(ctx: ActionContext, fid: string): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const pc = ctx.actor;
  if (fid === 'cunning_action_dash') {
    if (!hasClass(pc.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return true;
    }
    if (getClassLevel(pc.char, 'rogue') < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return true;
    }
    if (pc.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const caSpeed = effectiveSpeed(pc.char, ctx.context.lootTable);
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: true };
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [pc.char.id]: Math.max(0, (ctx.st.movement_used?.[pc.char.id] ?? 0) - caSpeed),
      },
    };
    ctx.narrative = `${pc.char.name} uses Cunning Action: Dash — +${caSpeed} ft movement this turn.`;
    return true;
  }

  if (fid === 'cunning_action_disengage') {
    if (!hasClass(pc.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return true;
    }
    if (getClassLevel(pc.char, 'rogue') < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return true;
    }
    if (pc.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: true, disengaged: true };
    ctx.narrative = `${pc.char.name} uses Cunning Action: Disengage — no opportunity attacks when moving this turn.`;
    return true;
  }

  if (fid === 'steady_aim') {
    if (!hasClass(pc.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Steady Aim.';
      return true;
    }
    if (getClassLevel(pc.char, 'rogue') < 3) {
      ctx.narrative = 'Steady Aim requires Rogue level 3.';
      return true;
    }
    if (pc.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    // SRD: usable only if you haven't moved this turn.
    if ((ctx.st.movement_used?.[pc.char.id] ?? 0) > 0) {
      ctx.narrative = 'Steady Aim needs a still aim — you have already moved this turn.';
      return true;
    }
    pc.char.turn_actions = {
      ...pc.char.turn_actions,
      bonus_action_used: true,
      steady_aim_pending: true,
    };
    // SRD: your Speed is 0 until the end of the turn — spend all remaining
    // movement so grid_move blocks any further step.
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [pc.char.id]: effectiveSpeed(pc.char, ctx.context.lootTable),
      },
    };
    ctx.narrative = `${pc.char.name} uses Steady Aim — advantage on the next attack this turn (Speed drops to 0).`;
    return true;
  }

  if (fid === 'cunning_action_hide') {
    if (!hasClass(pc.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return true;
    }
    if (getClassLevel(pc.char, 'rogue') < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return true;
    }
    if (pc.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    // Cunning Action grants Hide as a Bonus Action; the SRD Hide [Action]
    // resolution itself (prerequisite + flat DC 15 Stealth check) is shared
    // with the general `hide` action via resolveHideAttempt. A failed
    // prerequisite (rogue in plain view) doesn't spend the bonus action.
    const result = resolveHideAttempt(ctx);
    if (!result.ok) {
      ctx.narrative = `${pc.char.name} can't hide — ${result.reason}.`;
      return true;
    }
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: true };
    return true;
  }

  if (fid.startsWith('cunning_strike_')) {
    if (!hasClass(pc.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Strike.';
      return true;
    }
    if (getClassLevel(pc.char, 'rogue') < 5) {
      ctx.narrative = 'Cunning Strike requires Rogue level 5.';
      return true;
    }
    const effect = fid.replace('cunning_strike_', '') as NonNullable<
      typeof pc.char.turn_actions.cunning_strike_pending
    >;
    // SRD Devious Strikes (Rogue L14) — Daze / Knock Out / Obscure are extra
    // Cunning Strike options unlocked at L14.
    if (
      (effect === 'daze' || effect === 'knock_out' || effect === 'obscure') &&
      getClassLevel(pc.char, 'rogue') < 14
    ) {
      ctx.narrative = 'Devious Strikes (Daze / Knock Out / Obscure) requires Rogue level 14.';
      return true;
    }
    // SRD Supreme Sneak (Thief L9) — Stealth Attack keeps your Hide.
    if (
      effect === 'stealth_attack' &&
      !(pc.char.subclass === 'thief' && getClassLevel(pc.char, 'rogue') >= 9)
    ) {
      ctx.narrative = 'Stealth Attack requires a Thief of level 9.';
      return true;
    }
    pc.char.turn_actions = { ...pc.char.turn_actions, cunning_strike_pending: effect };
    ctx.narrative = `${pc.char.name} readies a Cunning Strike (${effect}) on the next Sneak Attack.`;
    return true;
  }

  return false;
}
