import {
  consumeBardicForCheck,
  consumeInspirationForCheck,
  consumeLuckForCheck,
  effectiveSpeed,
  inflictCondition,
  isHeavilyEncumbered,
} from '../../gameEngine.js';
import { effectiveLightFor, passivePerceptionDcInLight, skillCheck } from '../../rulesEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';

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
  if (fid === 'cunning_action_dash') {
    if (!hasClass(ctx.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return true;
    }
    if (getClassLevel(ctx.char, 'rogue') < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const caSpeed = effectiveSpeed(ctx.char);
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - caSpeed),
      },
    };
    ctx.narrative = `${ctx.char.name} uses Cunning Action: Dash — +${caSpeed} ft movement this turn.`;
    return true;
  }

  if (fid === 'cunning_action_disengage') {
    if (!hasClass(ctx.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return true;
    }
    if (getClassLevel(ctx.char, 'rogue') < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true, disengaged: true };
    ctx.narrative = `${ctx.char.name} uses Cunning Action: Disengage — no opportunity attacks when moving this turn.`;
    return true;
  }

  if (fid === 'cunning_action_hide') {
    if (!hasClass(ctx.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return true;
    }
    if (getClassLevel(ctx.char, 'rogue') < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
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
    const hideProf = ctx.char.skill_proficiencies?.includes('Stealth') ?? false;
    const inspAdvHide = consumeInspirationForCheck(ctx.char);
    const luckAdvHide = consumeLuckForCheck(ctx.char);
    const bardicHideRoll = consumeBardicForCheck(ctx.char);
    const hideCheck = skillCheck(
      ctx.char.dex,
      sneakHideDC - bardicHideRoll,
      hideProf,
      ctx.char.level,
      isHeavilyEncumbered(ctx.char),
      false,
      false,
      inspAdvHide || luckAdvHide,
      ctx.char.species === 'halfling'
    );
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    if (hideCheck.success) {
      ctx.char = inflictCondition(ctx.char, 'invisible');
      ctx.char.hide_dc = hideCheck.total;
      ctx.narrative = `${ctx.char.name} hides! (Stealth ${hideCheck.total} vs DC ${sneakHideDC} — success.) Hide DC = ${hideCheck.total}.`;
    } else {
      ctx.char.hide_dc = undefined;
      ctx.narrative = `${ctx.char.name} tries to hide but fails. (Stealth ${hideCheck.total} vs DC ${sneakHideDC})`;
    }
    return true;
  }

  if (fid.startsWith('cunning_strike_')) {
    if (!hasClass(ctx.char, 'rogue')) {
      ctx.narrative = 'Only Rogues have Cunning Strike.';
      return true;
    }
    if (getClassLevel(ctx.char, 'rogue') < 5) {
      ctx.narrative = 'Cunning Strike requires Rogue level 5.';
      return true;
    }
    const effect = fid.replace('cunning_strike_', '') as 'trip' | 'poison' | 'withdraw' | 'disarm';
    ctx.char.turn_actions = { ...ctx.char.turn_actions, cunning_strike_pending: effect };
    ctx.narrative = `${ctx.char.name} readies a Cunning Strike (${effect}) on the next Sneak Attack.`;
    return true;
  }

  return false;
}
