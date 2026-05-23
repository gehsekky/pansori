import { getClassLevel, hasClass } from '../../multiclass.js';
import { profBonus, rollDice } from '../../rulesEngine.js';
import type { ActionContext } from '../types.js';

/**
 * Fighter + Champion features (SRD-only build).
 *
 *  - `action_surge`: once per rest, refunds the action so the Fighter
 *    can take two actions this turn. Resets on short rest.
 *  - `tactical_master_{push|sap|slow}`: Fighter L9+. Pre-arms the next
 *    attack to apply the chosen mastery.
 *  - `second_wind`: 2/3/4 uses per rest at L1/4/10. Bonus action heal
 *    of 1d10 + level HP.
 *  - `remarkable_athlete`: Champion. Passive narrative line.
 */
export function handleFighterFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'action_surge') {
    if (!hasClass(ctx.char, 'fighter')) {
      ctx.narrative = 'Only Fighters have Action Surge.';
      return true;
    }
    if (getClassLevel(ctx.char, 'fighter') < 2) {
      ctx.narrative = 'Action Surge requires Fighter level 2.';
      return true;
    }
    if ((ctx.char.class_resource_uses?.action_surge ?? 0) >= 1) {
      ctx.narrative = 'Action Surge already used this rest.';
      return true;
    }
    ctx.char.class_resource_uses = { ...(ctx.char.class_resource_uses ?? {}), action_surge: 1 };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: false };
    ctx.narrative = `${ctx.char.name} uses Action Surge — one additional action this turn!`;
    return true;
  }

  if (
    fid === 'tactical_master_push' ||
    fid === 'tactical_master_sap' ||
    fid === 'tactical_master_slow'
  ) {
    if (!hasClass(ctx.char, 'fighter')) {
      ctx.narrative = 'Only Fighters have Tactical Master.';
      return true;
    }
    if (getClassLevel(ctx.char, 'fighter') < 9) {
      ctx.narrative = 'Tactical Master requires Fighter level 9.';
      return true;
    }
    if (ctx.char.turn_actions.tactical_master_mastery) {
      ctx.narrative = 'Tactical Master already queued this turn.';
      return true;
    }
    const m = fid.replace('tactical_master_', '') as 'push' | 'sap' | 'slow';
    ctx.char.turn_actions = { ...ctx.char.turn_actions, tactical_master_mastery: m };
    ctx.narrative = `${ctx.char.name} — Tactical Master: next attack will use ${m.toUpperCase()} mastery.`;
    return true;
  }

  if (fid === 'second_wind') {
    if (!hasClass(ctx.char, 'fighter')) {
      ctx.narrative = 'Only Fighters have Second Wind.';
      return true;
    }
    // Second Wind uses scale with Fighter level (RAW 2/3/4 at L1/4/10),
    // and the heal adds Fighter level — not total character level.
    const fighterLvl = getClassLevel(ctx.char, 'fighter');
    const swMax = fighterLvl >= 10 ? 4 : fighterLvl >= 4 ? 3 : 2;
    const swUsed = ctx.char.class_resource_uses?.second_wind ?? 0;
    if (swUsed >= swMax) {
      ctx.narrative = `Second Wind exhausted (${swMax}/${swMax} used). Recovers on a short or long rest.`;
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const swHeal = rollDice('1d10') + fighterLvl;
    ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + swHeal);
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      second_wind: swUsed + 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${ctx.char.name} uses Second Wind — healed ${swHeal} HP (now ${ctx.char.hp}/${ctx.char.max_hp}). (${swMax - swUsed - 1}/${swMax} remaining)`;
    return true;
  }

  if (fid === 'remarkable_athlete') {
    ctx.narrative = `${ctx.char.name} — Remarkable Athlete: add +${Math.ceil(profBonus(ctx.char.level) / 2)} to uninvested STR/DEX/CON checks (passive).`;
    return true;
  }

  return false;
}
