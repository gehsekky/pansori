import {
  consumeBardicForCheck,
  consumeInspirationForCheck,
  consumeLuckForCheck,
  effectiveSpeed,
  inflictCondition,
  isHeavilyEncumbered,
} from '../../gameEngine.js';
import { consumeStrokeOfLuck, strokeOfLuckAvailable } from '../../strokeOfLuck.js';
import { effectiveLightFor, passivePerceptionDcInLight, skillCheck } from '../../rulesEngine.js';
import {
  getClassLevel,
  hasClass,
  hasExpertise,
  hasJackOfAllTrades,
  hasReliableTalent,
} from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { updatePcActor } from '../actor.js';

/**
 * Rogue features. All gated by class === 'rogue' and level >= 2 (Cunning
 * Action) or level >= 5 (Cunning Strike).
 *
 *  - `cunning_action_dash`: bonus action, +effectiveSpeed of movement
 *    this turn (refunds movement_used by speed).
 *  - `cunning_action_disengage`: bonus action, sets `disengaged` so
 *    grid_move skips opportunity-attack triggers this turn.
 *  - `cunning_action_hide`: bonus action, Stealth check vs enemy passive
 *    Perception. Success sets `invisible` and stores hide_dc for enemies
 *    to beat with Perception/Search. Heavy encumbrance applies disadv;
 *    Halfling species gets the Lucky reroll.
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
    const caSpeed = effectiveSpeed(pc.char);
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
        [pc.char.id]: effectiveSpeed(pc.char),
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
    // 2024 PHB lighting affects the observer's passive Perception:
    // dim → -5, dark → effective 0. Cunning Action Hide reads the
    // room's lighting via the same path as the sneak action.
    const cunningRoomLighting =
      ctx.seed.rooms.find((r) => r.id === ctx.roomId)?.lighting ?? 'bright';
    const cunningEnemyLight = effectiveLightFor(cunningRoomLighting, 0);
    const sneakHideDC = ctx.enemyAlive
      ? passivePerceptionDcInLight(ctx.enemy!.wis ?? 10, cunningEnemyLight)
      : 10;
    const hideProf = pc.char.skill_proficiencies?.includes('Stealth') ?? false;
    const inspAdvHide = consumeInspirationForCheck(pc.char);
    const luckAdvHide = consumeLuckForCheck(pc.char);
    const bardicHideRoll = consumeBardicForCheck(pc.char);
    const hideCheck = skillCheck(
      pc.char.dex,
      sneakHideDC - bardicHideRoll,
      hideProf,
      pc.char.level,
      isHeavilyEncumbered(pc.char),
      hasExpertise(pc.char, 'Stealth'),
      hasJackOfAllTrades(pc.char),
      inspAdvHide || luckAdvHide,
      pc.char.species === 'halfling',
      hasReliableTalent(pc.char),
      strokeOfLuckAvailable(pc.char)
    );
    if (hideCheck.strokeOfLuckUsed) updatePcActor(ctx, consumeStrokeOfLuck(pc.char));
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: true };
    if (hideCheck.success) {
      updatePcActor(ctx, inflictCondition(pc.char, 'invisible'));
      pc.char.hide_dc = hideCheck.total;
      ctx.narrative = `${pc.char.name} hides! (Stealth ${hideCheck.total} vs DC ${sneakHideDC} — success.) Hide DC = ${hideCheck.total}.`;
    } else {
      pc.char.hide_dc = undefined;
      ctx.narrative = `${pc.char.name} tries to hide but fails. (Stealth ${hideCheck.total} vs DC ${sneakHideDC})`;
    }
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
    const effect = fid.replace('cunning_strike_', '') as 'trip' | 'poison' | 'withdraw' | 'disarm';
    pc.char.turn_actions = { ...pc.char.turn_actions, cunning_strike_pending: effect };
    ctx.narrative = `${pc.char.name} readies a Cunning Strike (${effect}) on the next Sneak Attack.`;
    return true;
  }

  return false;
}
