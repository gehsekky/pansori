import { BEAST_FORMS } from '../../../contexts/srd/index.js';
import { rollDice } from '../../rulesEngine.js';
import type { ActionContext } from '../types.js';

/**
 * Druid + Circle of the Moon features.
 *
 *  - `wild_shape` / `wild_shape_<formId>`: 2024 PHB action (Moon
 *    subclass: bonus action). 2 uses per short rest. CR access scales
 *    with level — Moon Druids unlock higher CRs sooner. Temp HP = 2×
 *    level (3× for Moon). Form supplied via fid suffix; empty fid
 *    falls back to the lowest CR available.
 *  - `dismiss_wild_shape`: revert to normal form. No cost.
 *  - `moon_healing`: Moon-only. Bonus action while shifted to spend
 *    a spell slot for 1d8/slot-level HP. Idempotent — no slot, no
 *    heal.
 */
export function handleDruidFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'wild_shape' || fid.startsWith('wild_shape_')) {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'druid') {
      ctx.narrative = 'Only Druids have Wild Shape.';
      return true;
    }
    if (ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are already in Wild Shape. Attack or use Dismiss Wild Shape to end it.';
      return true;
    }
    const wsUses = ctx.char.class_resource_uses?.wild_shape ?? 2;
    if (wsUses <= 0) {
      ctx.narrative = 'No Wild Shape uses remaining (recover on short rest).';
      return true;
    }
    const isMoon = ctx.char.subclass === 'moon';
    const formId = fid === 'wild_shape' ? '' : fid.replace('wild_shape_', '');
    const form = formId ? BEAST_FORMS[formId] : Object.values(BEAST_FORMS).find((f) => f.cr === 0);
    if (!form) {
      ctx.narrative = `Unknown beast form: ${formId}.`;
      return true;
    }
    const maxCR = isMoon
      ? Math.max(1, Math.floor(ctx.char.level / 3))
      : ctx.char.level >= 8
        ? 1
        : ctx.char.level >= 4
          ? 0.5
          : 0.25;
    if (form.cr > maxCR) {
      ctx.narrative = `${form.name} requires a higher-CR form access (you can access CR ≤ ${maxCR}).`;
      return true;
    }
    const tempHp = (isMoon ? 3 : 2) * ctx.char.level;
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      wild_shape: wsUses - 1,
    };
    ctx.char.conditions = [...ctx.char.conditions, 'wild_shaped'];
    ctx.char.wild_shape_form = form.id;
    ctx.char.hp = ctx.char.hp + tempHp;
    if (ctx.st.combat_active) {
      ctx.char.turn_actions = isMoon
        ? { ...ctx.char.turn_actions, bonus_action_used: true }
        : { ...ctx.char.turn_actions, action_used: true };
      if (isMoon) ctx.usedInitiative = false;
      else ctx.usedInitiative = true;
    }
    const traits = [
      form.packTactics ? 'Pack Tactics' : '',
      form.physicalResistance ? 'Physical Resistance' : '',
      form.flying ? 'Flying' : '',
      form.climbing ? 'Climb' : '',
    ]
      .filter(Boolean)
      .join(', ');
    const traitNote = traits ? ` Traits: ${traits}.` : '';
    ctx.narrative = `🐾 ${ctx.char.name} transforms into a ${form.name}!${isMoon ? ' (bonus action)' : ''} +${tempHp} temp HP. ${form.descriptor}.${traitNote} (${wsUses - 1} uses remaining)`;
    return true;
  }

  if (fid === 'dismiss_wild_shape') {
    if (!ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are not in Wild Shape.';
      return true;
    }
    ctx.char.wild_shape_form = undefined;
    ctx.char.conditions = ctx.char.conditions.filter((c) => c !== 'wild_shaped');
    ctx.narrative = `${ctx.char.name} reverts to their normal form.`;
    return true;
  }

  if (fid === 'moon_healing') {
    if (ctx.char.subclass !== 'moon' || ctx.char.character_class.toLowerCase() !== 'druid') {
      ctx.narrative = 'Only Circle of the Moon Druids have Moon Healing.';
      return true;
    }
    if (!ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You must be in Wild Shape to use Moon Healing.';
      return true;
    }
    const mhSlotsMax = ctx.char.spell_slots_max ?? {};
    const mhSlotsUsed = ctx.char.spell_slots_used ?? {};
    const mhSlotLvl = Object.keys(mhSlotsMax)
      .map(Number)
      .filter((n) => n >= 1 && (mhSlotsMax[n] ?? 0) > (mhSlotsUsed[n] ?? 0))
      .sort((a, b) => a - b)[0];
    if (mhSlotLvl === undefined) {
      ctx.narrative = 'No spell slot available for Moon Healing.';
      return true;
    }
    const heal = rollDice(`${mhSlotLvl}d8`);
    ctx.char.spell_slots_used = {
      ...mhSlotsUsed,
      [mhSlotLvl]: (mhSlotsUsed[mhSlotLvl] ?? 0) + 1,
    };
    ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + heal);
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `🌙 ${ctx.char.name} channels lunar energy — heals ${heal} HP (now ${ctx.char.hp}/${ctx.char.max_hp}). Spent lvl ${mhSlotLvl} slot.`;
    return true;
  }

  return false;
}
