import type { AbilityKey, Spell } from '../../../types.js';
import { d, hasArmorProficiency, spellSaveDC } from '../../rulesEngine.js';
import { hasClass, resolveCastingAbility } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { breakConcentration } from '../../gameEngine.js';
import { distanceFeet } from '../../gridEngine.js';

/**
 * Pre-cast gating, slot consumption, action economy bookkeeping, and
 * casting-ability resolution. Single source of truth for the "can this
 * spell be cast right now" check + the per-cast state mutations every
 * spell shares (slot decrement, action/bonus marker, Wild Magic Surge,
 * Eldritch Knight War Magic flag, Magic Initiate free-cast token).
 *
 * Mutates `ctx` directly. Returns `{ done: true }` when a gate fired
 * — the orchestrator returns immediately, narrative already set. On
 * success returns the derived state the per-shape branches need
 * (casting score, save DC, slot-note suffix).
 */
export type PrecastResult =
  | { done: true }
  | {
      done: false;
      castingScore: number;
      castingAbility: AbilityKey;
      slotNote: string;
      dc: number;
      isRitualCast: boolean;
    };

export function runPrecast(
  ctx: ActionContext,
  action: { type: 'cast_spell'; spellId: string; slotLevel: number; ritual?: boolean },
  spell: Spell
): PrecastResult {
  const { spellId, slotLevel } = action;
  const isRitualCast = action.ritual ?? false;

  // PHB p.144: cannot cast spells while wearing armor you are not proficient with
  const spellArmorItem = ctx.char.equipped_armor
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === ctx.char.inventory?.find((i) => i.instance_id === ctx.char.equipped_armor)?.id
      )
    : null;
  if (
    spellArmorItem &&
    !hasArmorProficiency(ctx.char.armor_proficiencies ?? [], spellArmorItem.armorCategory)
  ) {
    ctx.narrative = `You cannot cast spells while wearing ${spellArmorItem.name} — you are not proficient with ${spellArmorItem.armorCategory ?? 'this'} armor.`;
    return { done: true };
  }

  // Deafened: cannot cast spells with verbal components
  if (ctx.char.conditions.includes('deafened') && (spell as { verbal?: boolean }).verbal) {
    ctx.narrative = `You cannot cast ${spell.name} while deafened — it requires a verbal component.`;
    return { done: true };
  }

  // Ritual casting: no slot cost, only out of combat
  if (isRitualCast) {
    if (!(spell as { ritualCasting?: boolean }).ritualCasting) {
      ctx.narrative = `${spell.name} cannot be cast as a ritual.`;
      return { done: true };
    }
    if (ctx.st.combat_active) {
      ctx.narrative = `Ritual casting takes 10 minutes — not usable in combat.`;
      return { done: true };
    }
    // No slot consumed for ritual casting
  }

  // Spell preparation check (Cleric, Paladin, Druid). Multi-class
  // characters with ANY prep class are subject to prep enforcement.
  const prepClasses = ['cleric', 'paladin', 'druid'];
  if (prepClasses.some((c) => hasClass(ctx.char, c)) && spell.level > 0 && !isRitualCast) {
    const prepared = ctx.char.prepared_spells ?? [];
    if (prepared.length > 0 && !prepared.includes(spellId)) {
      // Reachable only as a safety net — the choice generator now
      // filters unprepared spells out of the cast menu (see the
      // prepClasses block in generateChoices). Prep is a long-rest
      // action, so the message no longer suggests mid-combat prep.
      ctx.narrative = `${spell.name} is not prepared. Prepare it on a long rest.`;
      return { done: true };
    }
  }

  // Break existing concentration if this spell also requires concentration (PHB p.203)
  if (spell.concentration && ctx.char.concentrating_on) {
    const { char: nc, st: ns } = breakConcentration(ctx.char, ctx.st, ctx.context);
    ctx.char = nc;
    ctx.st = ns;
  }

  // Magic Initiate free L1 cast (2024 PHB origin feat) — the player
  // picked one L1 spell when taking Magic Initiate (Arcane/Divine/
  // Primal). That specific spell can be cast 1× per long rest without
  // expending a slot; subsequent casts that day need a slot like any
  // other spell. Recognized by walking `feat_choices` for any feat
  // entry whose `magicInitiateL1` matches the spell being cast.
  let usedMagicInitiateFree = false;
  if (spell.level > 0 && !isRitualCast) {
    const choices = ctx.char.feat_choices ?? {};
    const matched = Object.values(choices).some((c) => c?.magicInitiateL1 === spellId);
    if (matched && (ctx.char.class_resource_uses?.magic_initiate_l1_used ?? 0) === 0) {
      // Free cast at the spell's base level — upcasting still
      // requires a slot, so gate the freebie to slotLevel === spell.level.
      if (slotLevel === spell.level) {
        ctx.char.class_resource_uses = {
          ...(ctx.char.class_resource_uses ?? {}),
          magic_initiate_l1_used: 1,
        };
        usedMagicInitiateFree = true;
      }
    }
  }

  // 2024 PHB / SRD 5.2.1 — costly material components (Identify's 100 gp
  // pearl, Revivify's 300 gp diamond, etc.) are consumed on cast. Block
  // the cast if the caster can't afford it; deduct from gold otherwise.
  // Checked BEFORE slot deduction so a missing diamond doesn't waste a
  // slot — RAW treats slot + material as a single cast-initiation event.
  if (spell.materialCost && spell.materialCost > 0) {
    if ((ctx.char.gold ?? 0) < spell.materialCost) {
      ctx.narrative = `${spell.name} requires a ${spell.materialCost} gp material component you don't have.`;
      return { done: true };
    }
  }

  // Expend a slot for non-cantrips (unless ritual or Magic-Initiate free cast)
  if (spell.level > 0 && !isRitualCast && !usedMagicInitiateFree) {
    if (slotLevel < spell.level) {
      ctx.narrative = `${spell.name} requires at least a level-${spell.level} slot.`;
      return { done: true };
    }
    const slotsMax = (ctx.char.spell_slots_max ?? {})[slotLevel] ?? 0;
    const slotsUsed = (ctx.char.spell_slots_used ?? {})[slotLevel] ?? 0;
    if (slotsUsed >= slotsMax) {
      ctx.narrative = `No level-${slotLevel} spell slots remaining (recovered on long rest).`;
      return { done: true };
    }
    ctx.char.spell_slots_used = {
      ...(ctx.char.spell_slots_used ?? {}),
      [slotLevel]: slotsUsed + 1,
    };
  }

  // Deduct the material cost now that slot + affordability are both
  // confirmed. Material is consumed on a successful cast initiation
  // even if a downstream gate (e.g. Revivify's death-window check)
  // later fails — RAW: the diamond is gone the moment you start
  // casting, not when the spell resolves.
  if (spell.materialCost && spell.materialCost > 0) {
    ctx.char.gold = (ctx.char.gold ?? 0) - spell.materialCost;
    ctx.narrative = `${ctx.char.name} expends a ${spell.materialCost} gp component. `;
  }

  // SRD 5.2.1 p.67 (Quickened Spell): after consuming Quickened, can't
  // cast a level 1+ spell on the same turn EXCEPT the quickened cast
  // itself (which is the spell that got "modified"). We detect the
  // quickened cast via ctx.st.metamagic_active === 'quickened' being still
  // active at the start of resolution.
  const isQuickenedCast = ctx.st.metamagic_active === 'quickened';
  if (
    spell.level > 0 &&
    !isRitualCast &&
    ctx.char.turn_actions.quickened_used &&
    !isQuickenedCast
  ) {
    ctx.narrative = 'You used Quickened Spell this turn — you cannot cast another level 1+ spell.';
    return { done: true };
  }

  // Mark action economy
  if (spell.castTime === 'bonus_action') {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
  } else {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: true };
  }
  // Track that a leveled spell was cast this turn (for the Quickened
  // activation check on a subsequent metamagic invocation).
  if (spell.level > 0 && !isRitualCast) {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, leveled_spell_cast: true };
  }

  // SRD Slow — "When the creature attempts to cast a spell with a
  // Somatic component, roll a d20. On an 11 or higher, the spell
  // functions normally; otherwise, the spell fails and the action,
  // bonus action, or reaction used to cast the spell is wasted."
  // Fires AFTER slot + action-economy consumption per RAW (the slot
  // is gone whether or not the spell fizzles). `somatic` defaults to
  // true if unspecified — virtually every SRD spell has S.
  const hasSomatic = (spell as { somatic?: boolean }).somatic ?? true;
  if (ctx.char.conditions.includes('slowed') && hasSomatic) {
    const fizzleRoll = d(20);
    if (fizzleRoll < 11) {
      ctx.narrative =
        (ctx.narrative ?? '') +
        `${ctx.char.name} tries to cast ${spell.name}${' (level-' + slotLevel + ' slot)'} but Slow disrupts the somatic gesture — the spell fizzles (rolled ${fizzleRoll}, needed 11+). The slot is spent.`;
      return { done: true };
    }
  }

  // Multiclass spell-casting ability resolution (2024 PHB). For a
  // multiclass PC, pick the best casting ability across the classes
  // whose spell list matches the spell's `spellList` tag. Single-
  // class PCs fall through to the primary-class lookup.
  const primaryCastingAbility = (ctx.context.spellcastingAbility?.[ctx.char.character_class] ??
    ctx.context.classPrimaryStats[ctx.char.character_class] ??
    'int') as AbilityKey;
  const castingAbility = resolveCastingAbility(
    ctx.char,
    (spell as { spellList?: ReadonlyArray<'arcane' | 'divine' | 'primal'> }).spellList,
    ctx.context.spellcastingAbility ?? {},
    primaryCastingAbility
  ) as AbilityKey;
  const castingScore = (ctx.char[castingAbility] ?? 10) as number;
  const slotNote = spell.level > 0 ? ` (level-${slotLevel} slot)` : ' (cantrip)';
  const dc = spellSaveDC(ctx.char.level, castingScore);

  return {
    done: false,
    castingScore,
    castingAbility,
    slotNote,
    dc,
    isRitualCast,
  };
}

/**
 * Range gate for offensive spells. SRD 5.2.1 enforces spell range
 * against the grid: 'self' needs no check, 'touch' is ≤5 ft, 'ranged'
 * is up to `spell.rangeFt`. On failure refunds the slot + action-economy
 * the precast already consumed. Returns `true` when out-of-range.
 */
export function isSpellOutOfRange(
  ctx: ActionContext,
  spell: Spell,
  spellTargetId: string,
  spellTargetName: string,
  slotLevel: number,
  isRitualCast: boolean
): boolean {
  if (!ctx.st.entities || !spell.rangeKind || spell.rangeKind === 'self') return false;
  const casterEnt = ctx.st.entities.find((e) => e.id === ctx.char.id);
  const targetEnt = ctx.st.entities.find((e) => e.id === spellTargetId && e.isEnemy);
  if (!casterEnt || !targetEnt) return false;

  const distFt = distanceFeet(casterEnt.pos, targetEnt.pos);
  const maxFt = spell.rangeKind === 'touch' ? 5 : (spell.rangeFt ?? 0);
  if (distFt <= maxFt) return false;

  ctx.narrative =
    spell.rangeKind === 'touch'
      ? `${spell.name} requires a touch — the ${spellTargetName} is ${distFt} ft away.`
      : `${spell.name} is out of range (${distFt} ft to target, max ${maxFt} ft).`;
  // Refund the slot we just spent
  if (spell.level > 0 && !isRitualCast) {
    const slotsUsedRefund = ctx.char.spell_slots_used?.[slotLevel] ?? 1;
    ctx.char.spell_slots_used = {
      ...(ctx.char.spell_slots_used ?? {}),
      [slotLevel]: Math.max(0, slotsUsedRefund - 1),
    };
  }
  // Refund the action economy too
  if (spell.castTime === 'bonus_action') {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: false };
  } else {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: false };
  }
  if (spell.level > 0 && !isRitualCast) {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, leveled_spell_cast: false };
  }
  return true;
}
