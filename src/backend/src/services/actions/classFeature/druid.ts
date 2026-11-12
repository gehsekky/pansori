import {
  CIRCLE_LANDS,
  type CircleLand,
  choosesCircleLand,
  circleLandSpells,
  syncSubclassSpells,
} from '../../subclassSpells.js';
import { getClassLevel, hasClass, wildShapeUsesMax } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { BEAST_FORMS } from '../../../campaignData/srd/index.js';

/**
 * Druid features (SRD-only build).
 *
 *  - `wild_shape` / `wild_shape_<formId>`: action. Uses by Druid level
 *    (wildShapeUsesMax); a Short Rest restores one, a Long Rest all. CR access scales with level — base table (≤8: CR 0.25,
 *    ≥4: CR 0.5, ≥8: CR 1). Temp HP = 2× druid level. Form supplied
 *    via fid suffix; empty fid
 *    falls back to the lowest CR available.
 *  - `dismiss_wild_shape`: revert to normal form. No cost.
 *  - `circle_land_<arid|polar|temperate|tropical>`: Circle of the Land's
 *    land choice, once after each Long Rest.
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
    const wsUses =
      char.class_resource_uses?.wild_shape ?? wildShapeUsesMax(getClassLevel(char, 'druid'));
    if (wsUses <= 0) {
      ctx.narrative = 'No Wild Shape uses remaining (a Short Rest restores one).';
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

  // SRD Circle of the Land Spells — after a Long Rest, choose a land type; its
  // Circle spells (for your Druid level) are always prepared until you choose
  // again.
  if (fid.startsWith('circle_land_')) {
    const land = fid.slice('circle_land_'.length) as CircleLand;
    if (!CIRCLE_LANDS.includes(land)) return false;
    if (!choosesCircleLand(char)) {
      ctx.narrative = 'Only a Circle of the Land Druid (level 3+) chooses a land.';
      return true;
    }
    if (char.class_resource_uses?.circle_land_chosen) {
      ctx.narrative = 'You choose your land when you finish a Long Rest.';
      return true;
    }
    char.circle_land = land;
    char.class_resource_uses = { ...(char.class_resource_uses ?? {}), circle_land_chosen: 1 };
    syncSubclassSpells(char);
    const names = circleLandSpells(land, getClassLevel(char, 'druid'))
      .map((id) => ctx.context.spellTable?.[id]?.name ?? id)
      .join(', ');
    ctx.narrative = `🌿 ${char.name} attunes to the ${land} lands. Circle spells always prepared: ${names}.`;
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
