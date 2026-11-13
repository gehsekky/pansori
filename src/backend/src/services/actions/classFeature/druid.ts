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
import type { Character } from '../../../types.js';
import { randomUUID } from 'crypto';

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
export function handleDruidFeature(ctx: ActionContext, fid: string, option?: string): boolean {
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
    // SRD Wild Shape — a Bonus Action; Temporary Hit Points equal to your
    // Druid level (temp HP doesn't stack: keep the higher).
    if (ctx.st.combat_active && char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Wild Shape takes a Bonus Action — you have already used yours.';
      return true;
    }
    const tempHp = druidLvl;
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      wild_shape: wsUses - 1,
    };
    char.conditions = [...char.conditions, 'wild_shaped'];
    char.wild_shape_form = form.id;
    char.temp_hp = Math.max(char.temp_hp ?? 0, tempHp);
    if (ctx.st.combat_active) {
      char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
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
    // SRD — leaving the form early is a Bonus Action.
    if (ctx.st.combat_active) {
      if (char.turn_actions.bonus_action_used) {
        ctx.narrative = 'Leaving Wild Shape takes a Bonus Action — you have already used yours.';
        return true;
      }
      char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    }
    char.wild_shape_form = undefined;
    char.conditions = char.conditions.filter((c) => c !== 'wild_shaped');
    ctx.narrative = `${char.name} reverts to their normal form.`;
    return true;
  }

  // SRD Wild Companion (L2) — expend a Wild Shape use or a spell slot to cast
  // Find Familiar without Material components; the familiar is Fey and
  // vanishes at the next Long Rest. `option` is the form. Out of combat (a
  // summon joins at the next combat start).
  if (fid === 'wild_companion_ws' || fid === 'wild_companion_slot') {
    if (getClassLevel(char, 'druid') < 2) {
      ctx.narrative = 'Wild Companion requires a Druid of level 2.';
      return true;
    }
    if (ctx.st.combat_active) {
      ctx.narrative = 'Call your Wild Companion outside combat.';
      return true;
    }
    const summon = ctx.context.spellTable?.find_familiar?.summon;
    const form = summon
      ? [summon, ...(summon.variants ?? [])].find((f) => f.name === option)
      : undefined;
    if (!summon || !form) {
      ctx.narrative = 'Choose a form for your Wild Companion.';
      return true;
    }
    let cost: string;
    if (fid === 'wild_companion_ws') {
      const ws = wildShapeUsesLeft(char);
      if (ws <= 0) {
        ctx.narrative = 'No Wild Shape uses left.';
        return true;
      }
      char.class_resource_uses = { ...(char.class_resource_uses ?? {}), wild_shape: ws - 1 };
      cost = 'a use of Wild Shape';
    } else {
      const slot = lowestOpenSlot(char);
      if (!slot) {
        ctx.narrative = 'No spell slot left.';
        return true;
      }
      char.spell_slots_used = {
        ...(char.spell_slots_used ?? {}),
        [slot]: (char.spell_slots_used?.[slot] ?? 0) + 1,
      };
      cost = `a level-${slot} slot`;
    }
    ctx.st = {
      ...ctx.st,
      summoned_allies: [
        ...(ctx.st.summoned_allies ?? []).filter((a) => !(a.familiar && a.ownerId === char.id)),
        {
          id: `summon-${randomUUID()}`,
          ownerId: char.id,
          name: form.name,
          ac: form.ac,
          maxHp: form.maxHp,
          toHit: form.toHit,
          damage: form.damage,
          noAttack: summon.noAttack,
          familiar: true,
          wild_companion: true,
        },
      ],
    };
    ctx.narrative = `🌿 ${char.name} spends ${cost} — a fey spirit takes the shape of a ${form.name} and joins them (until the next Long Rest).`;
    return true;
  }

  // SRD Wild Resurgence (L5) — (a) with no Wild Shape uses left, expend a spell
  // slot to regain one (once per turn); (b) expend a Wild Shape use to regain a
  // level-1 slot (once per Long Rest). No action.
  if (fid === 'wild_resurgence_ws' || fid === 'wild_resurgence_slot') {
    if (getClassLevel(char, 'druid') < 5) {
      ctx.narrative = 'Wild Resurgence requires a Druid of level 5.';
      return true;
    }
    const ws = wildShapeUsesLeft(char);
    if (fid === 'wild_resurgence_ws') {
      if (ws > 0) {
        ctx.narrative = 'You still have a Wild Shape use.';
        return true;
      }
      if (ctx.st.combat_active && char.turn_actions.wild_resurgence_used) {
        ctx.narrative = 'Wild Resurgence works once per turn.';
        return true;
      }
      const slot = lowestOpenSlot(char);
      if (!slot) {
        ctx.narrative = 'No spell slot left to spend.';
        return true;
      }
      char.spell_slots_used = {
        ...(char.spell_slots_used ?? {}),
        [slot]: (char.spell_slots_used?.[slot] ?? 0) + 1,
      };
      char.class_resource_uses = { ...(char.class_resource_uses ?? {}), wild_shape: 1 };
      if (ctx.st.combat_active) {
        char.turn_actions = { ...char.turn_actions, wild_resurgence_used: true };
      }
      ctx.narrative = `${char.name} spends a level-${slot} slot to regain a use of Wild Shape.`;
      return true;
    }
    if ((char.class_resource_uses?.wild_resurgence_slot_used ?? 0) > 0) {
      ctx.narrative = 'You can do that again after a Long Rest.';
      return true;
    }
    if (ws <= 0) {
      ctx.narrative = 'No Wild Shape use to spend.';
      return true;
    }
    if ((char.spell_slots_used?.[1] ?? 0) <= 0) {
      ctx.narrative = 'You have no expended level-1 slot to regain.';
      return true;
    }
    char.spell_slots_used = { ...(char.spell_slots_used ?? {}), 1: char.spell_slots_used![1] - 1 };
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      wild_shape: ws - 1,
      wild_resurgence_slot_used: 1,
    };
    ctx.narrative = `${char.name} spends a use of Wild Shape to regain a level-1 spell slot.`;
    return true;
  }

  // SRD Archdruid — Nature Magician (L20): convert N Wild Shape uses into one
  // expended spell slot of level 2N (no action), once per Long Rest. `option`
  // is N.
  if (fid === 'nature_magician') {
    if (getClassLevel(char, 'druid') < 20) {
      ctx.narrative = 'Nature Magician requires a Druid of level 20.';
      return true;
    }
    if ((char.class_resource_uses?.nature_magician_used ?? 0) > 0) {
      ctx.narrative = 'Nature Magician returns after a Long Rest.';
      return true;
    }
    const n = Number(option);
    const ws = wildShapeUsesLeft(char);
    const lvl = 2 * n;
    if (!Number.isInteger(n) || n < 1 || n > ws || lvl > 9) {
      ctx.narrative = 'Choose how many Wild Shape uses to convert.';
      return true;
    }
    if ((char.spell_slots_used?.[lvl] ?? 0) <= 0) {
      ctx.narrative = `You have no expended level-${lvl} slot to regain.`;
      return true;
    }
    char.spell_slots_used = {
      ...(char.spell_slots_used ?? {}),
      [lvl]: char.spell_slots_used![lvl] - 1,
    };
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      wild_shape: ws - n,
      nature_magician_used: 1,
    };
    ctx.narrative = `${char.name} turns ${n} Wild Shape use${n === 1 ? '' : 's'} into a level-${lvl} spell slot.`;
    return true;
  }

  return false;
}

/** Wild Shape uses left (unset means a full pool). */
export function wildShapeUsesLeft(char: Character): number {
  return char.class_resource_uses?.wild_shape ?? wildShapeUsesMax(getClassLevel(char, 'druid'));
}

/** The lowest spell-slot level with a slot left, or 0. */
function lowestOpenSlot(char: Character): number {
  return (
    Object.keys(char.spell_slots_max ?? {})
      .map(Number)
      .sort((a, b) => a - b)
      .find((l) => (char.spell_slots_used?.[l] ?? 0) < (char.spell_slots_max?.[l] ?? 0)) ?? 0
  );
}

/**
 * SRD Archdruid — Evergreen Wild Shape (L20): rolling Initiative with no Wild
 * Shape uses left regains one.
 */
export function evergreenWildShape(char: Character): Character {
  if (getClassLevel(char, 'druid') < 20 || wildShapeUsesLeft(char) > 0) return char;
  return {
    ...char,
    class_resource_uses: { ...(char.class_resource_uses ?? {}), wild_shape: 1 },
  };
}
