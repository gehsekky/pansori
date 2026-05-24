import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { BEAST_FORMS } from '../../../contexts/srd/index.js';

/**
 * Druid features (SRD-only build).
 *
 *  - `wild_shape` / `wild_shape_<formId>`: action. 2 uses per short
 *    rest. CR access scales with level — base table (≤8: CR 0.25,
 *    ≥4: CR 0.5, ≥8: CR 1). Temp HP = 2× druid level. Form supplied
 *    via fid suffix; empty fid
 *    falls back to the lowest CR available.
 *  - `dismiss_wild_shape`: revert to normal form. No cost.
 */
export function handleDruidFeature(ctx: ActionContext, fid: string): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (fid === 'wild_shape' || fid.startsWith('wild_shape_')) {
    if (!hasClass(char, 'druid')) {
      ctx.narrative = 'Only Druids have Wild Shape.';
      return true;
    }
    if (char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are already in Wild Shape. Attack or use Dismiss Wild Shape to end it.';
      return true;
    }
    const wsUses = char.class_resource_uses?.wild_shape ?? 2;
    if (wsUses <= 0) {
      ctx.narrative = 'No Wild Shape uses remaining (recover on short rest).';
      return true;
    }
    const formId = fid === 'wild_shape' ? '' : fid.replace('wild_shape_', '');
    const form = formId ? BEAST_FORMS[formId] : Object.values(BEAST_FORMS).find((f) => f.cr === 0);
    if (!form) {
      ctx.narrative = `Unknown beast form: ${formId}.`;
      return true;
    }
    // CR access + temp HP scale with Druid level (not total level).
    const druidLvl = getClassLevel(char, 'druid');
    const maxCR = druidLvl >= 8 ? 1 : druidLvl >= 4 ? 0.5 : 0.25;
    if (form.cr > maxCR) {
      ctx.narrative = `${form.name} requires a higher-CR form access (you can access CR ≤ ${maxCR}).`;
      return true;
    }
    const tempHp = 2 * druidLvl;
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      wild_shape: wsUses - 1,
    };
    char.conditions = [...char.conditions, 'wild_shaped'];
    char.wild_shape_form = form.id;
    char.hp = char.hp + tempHp;
    if (ctx.st.combat_active) {
      char.turn_actions = { ...char.turn_actions, action_used: true };
      ctx.usedInitiative = true;
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
    ctx.narrative = `🐾 ${char.name} transforms into a ${form.name}! +${tempHp} temp HP. ${form.descriptor}.${traitNote} (${wsUses - 1} uses remaining)`;
    return true;
  }

  if (fid === 'dismiss_wild_shape') {
    if (!char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are not in Wild Shape.';
      return true;
    }
    char.wild_shape_form = undefined;
    char.conditions = char.conditions.filter((c) => c !== 'wild_shaped');
    ctx.narrative = `${char.name} reverts to their normal form.`;
    return true;
  }

  return false;
}
