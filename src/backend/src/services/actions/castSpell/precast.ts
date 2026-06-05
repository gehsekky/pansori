import type { AbilityKey, Spell } from '../../../types.js';
import { SQUARE_SIZE, distanceFeet, hasLineOfSight } from '../../gridEngine.js';
import { breakConcentration, isSpellSuppressed } from '../../gameEngine.js';
import { d, hasArmorProficiency, rollDice, spellSaveDC } from '../../rulesEngine.js';
import { getClassLevel, hasClass, resolveCastingAbility } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { equippedArmorId } from '../../equipment.js';
import { spellRecallKeepsSlot } from '../../feats.js';
import { updatePcActor } from '../actor.js';

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
      // True when the cast spent no slot (Divine Intervention or Magic
      // Initiate free cast). The out-of-range refund path reads this to
      // avoid crediting back a slot that was never consumed.
      freeCast: boolean;
    };

export function runPrecast(
  ctx: ActionContext,
  action: {
    type: 'cast_spell';
    spellId: string;
    slotLevel: number;
    ritual?: boolean;
    divineIntervention?: boolean;
    overchannel?: boolean;
    mysticArcanum?: boolean;
    wishDuplicate?: boolean;
  },
  spell: Spell
): PrecastResult {
  if (ctx.actor.kind !== 'pc') return { done: true };
  const pc = ctx.actor;
  const { spellId, slotLevel } = action;
  const isRitualCast = action.ritual ?? false;
  // SRD Wish (basic use) — a duplicated spell "simply takes effect": no slot,
  // no prep, no material component, no level prerequisite. Treated like the
  // other slot-free casts (Divine Intervention etc.) in the gates below.
  const usedWish = action.wishDuplicate === true;

  // Sorcerer Metamagic — capture the modifier set by the prior activation and
  // clear it from state so it applies to exactly this one cast. Done first so
  // it's consumed even if a downstream gate aborts the cast.
  ctx.metamagic = ctx.st.metamagic_active ?? [];
  if (ctx.st.metamagic_active) ctx.st = { ...ctx.st, metamagic_active: undefined };
  const isSubtle = ctx.metamagic.includes('subtle');

  // PHB p.144: cannot cast spells while wearing armor you are not proficient with
  const spellArmorItem = equippedArmorId(pc.char)
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === pc.char.inventory?.find((i) => i.instance_id === equippedArmorId(pc.char))?.id
      )
    : null;
  if (
    spellArmorItem &&
    !hasArmorProficiency(pc.char.armor_proficiencies ?? [], spellArmorItem.armorCategory)
  ) {
    ctx.narrative = `You cannot cast spells while wearing ${spellArmorItem.name} — you are not proficient with ${spellArmorItem.armorCategory ?? 'this'} armor.`;
    return { done: true };
  }

  // Deafened: cannot cast spells with verbal components (Subtle Spell removes
  // the verbal component, so it bypasses this gate).
  if (
    !isSubtle &&
    pc.char.conditions.includes('deafened') &&
    (spell as { verbal?: boolean }).verbal
  ) {
    ctx.narrative = `You cannot cast ${spell.name} while deafened — it requires a verbal component.`;
    return { done: true };
  }

  // SRD Silence: a caster standing inside a Silence zone can't cast a spell with
  // a Verbal component (Subtle Spell bypasses it). Reads the caster's grid cell
  // against any `blocksVerbal` SpellZone in the room.
  if (!isSubtle && (spell as { verbal?: boolean }).verbal) {
    const casterPos = ctx.st.entities?.find((e) => e.id === pc.char.id)?.pos;
    const silenced =
      !!casterPos &&
      (ctx.st.spell_zones ?? []).some(
        (z) => z.blocksVerbal && z.cells.some((c) => c.x === casterPos.x && c.y === casterPos.y)
      );
    if (silenced) {
      ctx.narrative = `You cannot cast ${spell.name} — its verbal component is smothered by magical Silence.`;
      return { done: true };
    }
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

  // SRD Divine Intervention (Cleric L10) — as a Magic action, cast any
  // Cleric spell of level 5 or lower that doesn't require a Reaction,
  // without expending a slot or Material components, 1/Long Rest. The
  // choice surface only offers eligible spells; this re-validates and,
  // on success, bypasses the prep / slot / material gates below.
  let usedDivineIntervention = false;
  if (action.divineIntervention) {
    if (getClassLevel(pc.char, 'cleric') < 10) {
      ctx.narrative = 'Divine Intervention requires Cleric level 10.';
      return { done: true };
    }
    if ((pc.char.class_resource_uses?.divine_intervention_used ?? 0) > 0) {
      ctx.narrative = 'Divine Intervention is spent — it returns after a long rest.';
      return { done: true };
    }
    const onClericList =
      (spell as { spellList?: ReadonlyArray<string> }).spellList?.includes('divine') ?? false;
    if (!onClericList || spell.level === 0 || spell.level > 5 || spell.castTime === 'reaction') {
      ctx.narrative = `${spell.name} can't be chosen for Divine Intervention — it must be a Cleric spell of level 1-5 that isn't a Reaction.`;
      return { done: true };
    }
    pc.char.class_resource_uses = {
      ...(pc.char.class_resource_uses ?? {}),
      divine_intervention_used: 1,
    };
    usedDivineIntervention = true;
  }

  // SRD Evoker Overchannel (L14) — maximize a damaging spell cast with a
  // level 1-5 slot (the damage-roll sites read `ctx.overchannel`). Validated
  // here; the escalating Necrotic self-damage is applied below once the cast
  // is committed (slot + action spent).
  const useOverchannel = action.overchannel === true;
  if (useOverchannel) {
    if (!(pc.char.subclass === 'evoker' && getClassLevel(pc.char, 'wizard') >= 14)) {
      ctx.narrative = 'Overchannel requires an Evoker of level 14.';
      return { done: true };
    }
    if (slotLevel < 1 || slotLevel > 5) {
      ctx.narrative = 'Overchannel works only on spells cast with a level 1-5 slot.';
      return { done: true };
    }
    if (!spell.damage) {
      ctx.narrative = 'Overchannel only affects a spell that deals damage.';
      return { done: true };
    }
  }
  ctx.overchannel = useOverchannel;

  // SRD Wizard Spell Mastery (L18) — a designated L1/L2 action spell is cast at
  // its base level without a slot (the bonus cast; upcasting still needs one).
  let usedSpellMastery = false;
  if (spell.level > 0 && !isRitualCast && slotLevel === spell.level) {
    if (
      (spell.level === 1 && pc.char.spell_mastery_l1 === spellId) ||
      (spell.level === 2 && pc.char.spell_mastery_l2 === spellId)
    ) {
      usedSpellMastery = true;
    }
  }
  // SRD Wizard Signature Spells (L20) — a designated L3 spell is cast once at
  // level 3 without a slot, recharging on a short/long rest.
  let usedSignature = false;
  if (
    spell.level === 3 &&
    !isRitualCast &&
    slotLevel === 3 &&
    (pc.char.signature_spells ?? []).includes(spellId)
  ) {
    const sigKey = `signature_used_${spellId}`;
    if ((pc.char.class_resource_uses?.[sigKey] ?? 0) === 0) {
      pc.char.class_resource_uses = { ...(pc.char.class_resource_uses ?? {}), [sigKey]: 1 };
      usedSignature = true;
    }
  }
  // SRD Warlock Mystic Arcanum (L11/13/15/17) — the chosen L6-9 spell for its
  // tier casts once per long rest without a slot.
  let usedMysticArcanum = false;
  if (action.mysticArcanum && !isRitualCast && spell.level >= 6 && spell.level <= 9) {
    const tierGate: Record<number, number> = { 6: 11, 7: 13, 8: 15, 9: 17 };
    if (getClassLevel(pc.char, 'warlock') < (tierGate[spell.level] ?? 99)) {
      ctx.narrative = `Mystic Arcanum (level ${spell.level}) requires a higher Warlock level.`;
      return { done: true };
    }
    if (pc.char.mystic_arcanum?.[spell.level] !== spellId) {
      ctx.narrative = `${spell.name} is not your level-${spell.level} Mystic Arcanum.`;
      return { done: true };
    }
    const arcKey = `mystic_arcanum_${spell.level}`;
    if ((pc.char.class_resource_uses?.[arcKey] ?? 0) > 0) {
      ctx.narrative = `Your level-${spell.level} Mystic Arcanum is spent — it returns after a long rest.`;
      return { done: true };
    }
    pc.char.class_resource_uses = { ...(pc.char.class_resource_uses ?? {}), [arcKey]: 1 };
    usedMysticArcanum = true;
  }

  // Long-cast spells (1 minute+, e.g. Animate Dead) can't be cast in
  // combat. Gated before slot spend so an in-combat attempt doesn't
  // waste a slot.
  if (spell.outOfCombatOnly && ctx.st.combat_active) {
    ctx.narrative = `${spell.name} has a long casting time — cast it out of combat.`;
    return { done: true };
  }

  // SRD anti-magic suppression — Antimagic Field / Globe of Invulnerability. A
  // spell that crosses such a zone fizzles before the slot is spent. Checked at
  // the slot level (upcasts count toward Globe's cap). The suppression spells
  // themselves still raise their zone normally (their own zone doesn't exist yet
  // at cast time, so this never self-blocks).
  if (ctx.st.combat_active) {
    const targetId = (action as { targetEnemyId?: string }).targetEnemyId;
    const targetPos = targetId
      ? ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.pos
      : undefined;
    const sup = isSpellSuppressed(ctx.st, pc.char.id, targetPos, slotLevel);
    if (sup.blocked) {
      ctx.narrative = `${spell.name} fizzles — ${sup.zoneName} suppresses the magic.`;
      return { done: true };
    }
  }

  // Spell preparation check (Cleric, Paladin, Druid). Multi-class
  // characters with ANY prep class are subject to prep enforcement.
  const prepClasses = ['cleric', 'paladin', 'druid', 'wizard'];
  if (
    prepClasses.some((c) => hasClass(pc.char, c)) &&
    spell.level > 0 &&
    !isRitualCast &&
    !usedDivineIntervention &&
    !usedWish
  ) {
    const prepared = pc.char.prepared_spells ?? [];
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
  if (spell.concentration && pc.char.concentrating_on) {
    const { char: nc, st: ns } = breakConcentration(pc.char, ctx.st, ctx.context);
    updatePcActor(ctx, nc);
    ctx.st = ns;
  }

  // Magic Initiate free L1 cast (2024 PHB origin feat) — the player
  // picked one L1 spell when taking Magic Initiate (Arcane/Divine/
  // Primal). That specific spell can be cast 1× per long rest without
  // expending a slot; subsequent casts that day need a slot like any
  // other spell. Recognized by walking `feat_choices` for any feat
  // entry whose `magicInitiateL1` matches the spell being cast.
  let usedMagicInitiateFree = false;
  if (spell.level > 0 && !isRitualCast && !usedDivineIntervention) {
    const choices = pc.char.feat_choices ?? {};
    const matched = Object.values(choices).some((c) => c?.magicInitiateL1 === spellId);
    if (matched && (pc.char.class_resource_uses?.magic_initiate_l1_used ?? 0) === 0) {
      // Free cast at the spell's base level — upcasting still
      // requires a slot, so gate the freebie to slotLevel === spell.level.
      if (slotLevel === spell.level) {
        pc.char.class_resource_uses = {
          ...(pc.char.class_resource_uses ?? {}),
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
  if (spell.materialCost && spell.materialCost > 0 && !usedDivineIntervention && !usedWish) {
    if ((pc.char.gold ?? 0) < spell.materialCost) {
      ctx.narrative = `${spell.name} requires a ${spell.materialCost} gp material component you don't have.`;
      return { done: true };
    }
  }

  // Expend a slot for non-cantrips (unless ritual, or a slot-free cast —
  // Magic Initiate, Divine Intervention, Spell Mastery, Signature Spell)
  if (
    spell.level > 0 &&
    !isRitualCast &&
    !usedMagicInitiateFree &&
    !usedDivineIntervention &&
    !usedSpellMastery &&
    !usedSignature &&
    !usedMysticArcanum &&
    !usedWish
  ) {
    if (slotLevel < spell.level) {
      ctx.narrative = `${spell.name} requires at least a level-${spell.level} slot.`;
      return { done: true };
    }
    const slotsMax = (pc.char.spell_slots_max ?? {})[slotLevel] ?? 0;
    const slotsUsed = (pc.char.spell_slots_used ?? {})[slotLevel] ?? 0;
    if (slotsUsed >= slotsMax) {
      ctx.narrative = `No level-${slotLevel} spell slots remaining (recovered on long rest).`;
      return { done: true };
    }
    // SRD Boon of Spell Recall — Free Casting: roll 1d4 as the level 1–4 slot is
    // about to be spent; on a match to the slot's level the slot is kept (the
    // cast still happens). You still need an available slot to cast — only the
    // expenditure is refunded.
    if (spellRecallKeepsSlot(pc.char, slotLevel, d(4))) {
      ctx.narrative =
        (ctx.narrative ?? '') +
        `${pc.char.name}'s Spell Recall holds the level-${slotLevel} slot — it isn't expended! `;
    } else {
      pc.char.spell_slots_used = {
        ...(pc.char.spell_slots_used ?? {}),
        [slotLevel]: slotsUsed + 1,
      };
    }
  }

  // Deduct the material cost now that slot + affordability are both
  // confirmed. Material is consumed on a successful cast initiation
  // even if a downstream gate (e.g. Revivify's death-window check)
  // later fails — RAW: the diamond is gone the moment you start
  // casting, not when the spell resolves.
  if (spell.materialCost && spell.materialCost > 0 && !usedDivineIntervention && !usedWish) {
    pc.char.gold = (pc.char.gold ?? 0) - spell.materialCost;
    ctx.narrative = `${pc.char.name} expends a ${spell.materialCost} gp component. `;
  }

  // SRD 5.2.1 p.67 (Quickened Spell): after consuming Quickened, can't
  // cast a level 1+ spell on the same turn EXCEPT the quickened cast
  // itself (which is the spell that got "modified"). We detect the
  // quickened cast via ctx.st.metamagic_active === 'quickened' being still
  // active at the start of resolution.
  const isQuickenedCast = ctx.metamagic.includes('quickened');
  if (spell.level > 0 && !isRitualCast && pc.char.turn_actions.quickened_used && !isQuickenedCast) {
    ctx.narrative = 'You used Quickened Spell this turn — you cannot cast another level 1+ spell.';
    return { done: true };
  }

  // Mark action economy. Divine Intervention is itself a Magic action, so
  // it always costs the action regardless of the chosen spell's normal
  // cast time (a bonus-action spell cast via DI still costs your action).
  if (spell.castTime === 'bonus_action' && !usedDivineIntervention) {
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: true };
  } else {
    pc.char.turn_actions = { ...pc.char.turn_actions, action_used: true };
  }
  // Track that a leveled spell was cast this turn (for the Quickened
  // activation check on a subsequent metamagic invocation).
  if (spell.level > 0 && !isRitualCast) {
    pc.char.turn_actions = { ...pc.char.turn_actions, leveled_spell_cast: true };
  }

  // SRD Slow — "When the creature attempts to cast a spell with a
  // Somatic component, roll a d20. On an 11 or higher, the spell
  // functions normally; otherwise, the spell fails and the action,
  // bonus action, or reaction used to cast the spell is wasted."
  // Fires AFTER slot + action-economy consumption per RAW (the slot
  // is gone whether or not the spell fizzles). `somatic` defaults to
  // true if unspecified — virtually every SRD spell has S.
  // Subtle Spell removes the somatic component, so Slow can't disrupt it.
  const hasSomatic = !isSubtle && ((spell as { somatic?: boolean }).somatic ?? true);
  if (pc.char.conditions.includes('slowed') && hasSomatic) {
    const fizzleRoll = d(20);
    if (fizzleRoll < 11) {
      ctx.narrative =
        (ctx.narrative ?? '') +
        `${pc.char.name} tries to cast ${spell.name}${' (level-' + slotLevel + ' slot)'} but Slow disrupts the somatic gesture — the spell fizzles (rolled ${fizzleRoll}, needed 11+). The slot is spent.`;
      return { done: true };
    }
  }

  // Overchannel escalating cost (SRD) — the first use per long rest is free;
  // each later use deals (uses + 1)d12 Necrotic per slot level, ignoring
  // Resistance / Immunity. Applied now that the cast is committed.
  if (useOverchannel) {
    const priorUses = pc.char.class_resource_uses?.overchannel_uses ?? 0;
    pc.char.class_resource_uses = {
      ...(pc.char.class_resource_uses ?? {}),
      overchannel_uses: priorUses + 1,
    };
    if (priorUses >= 1) {
      const backlash = rollDice(`${(priorUses + 1) * slotLevel}d12`);
      pc.char.hp = Math.max(0, pc.char.hp - backlash);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === pc.char.id && !e.isEnemy ? { ...e, hp: pc.char.hp } : e
        ),
      };
      ctx.narrative =
        (ctx.narrative ?? '') +
        `${pc.char.name} overchannels for maximum damage — ${backlash} Necrotic backlash (now ${pc.char.hp} HP). `;
    } else {
      ctx.narrative = (ctx.narrative ?? '') + `${pc.char.name} overchannels for maximum damage! `;
    }
  }

  // Multiclass spell-casting ability resolution (2024 PHB). For a
  // multiclass PC, pick the best casting ability across the classes
  // whose spell list matches the spell's `spellList` tag. Single-
  // class PCs fall through to the primary-class lookup.
  const primaryCastingAbility = (ctx.context.spellcastingAbility?.[pc.char.character_class] ??
    ctx.context.classPrimaryStats[pc.char.character_class] ??
    'int') as AbilityKey;
  const castingAbility = resolveCastingAbility(
    pc.char,
    (spell as { spellList?: ReadonlyArray<'arcane' | 'divine' | 'primal'> }).spellList,
    ctx.context.spellcastingAbility ?? {},
    primaryCastingAbility
  ) as AbilityKey;
  const castingScore = (pc.char[castingAbility] ?? 10) as number;
  const slotNote = usedDivineIntervention
    ? ' (Divine Intervention)'
    : usedMysticArcanum
      ? ' (Mystic Arcanum)'
      : usedSpellMastery
        ? ' (Spell Mastery)'
        : usedSignature
          ? ' (Signature Spell)'
          : spell.level > 0
            ? ` (level-${slotLevel} slot)`
            : ' (cantrip)';
  // SRD Sorcerer Innate Sorcery (L1): +1 spell save DC while active.
  const innateDcBonus = pc.char.conditions.includes('innate_sorcery') ? 1 : 0;
  const dc = spellSaveDC(pc.char.level, castingScore) + innateDcBonus;

  return {
    done: false,
    castingScore,
    castingAbility,
    slotNote,
    dc,
    isRitualCast,
    freeCast:
      usedDivineIntervention ||
      usedMagicInitiateFree ||
      usedSpellMastery ||
      usedSignature ||
      usedMysticArcanum ||
      usedWish,
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
  isRitualCast: boolean,
  freeCast = false
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const pc = ctx.actor;
  if (!ctx.st.entities || !spell.rangeKind || spell.rangeKind === 'self') return false;
  const casterEnt = ctx.st.entities.find((e) => e.id === pc.char.id);
  const targetEnt = ctx.st.entities.find((e) => e.id === spellTargetId && e.isEnemy);
  if (!casterEnt || !targetEnt) return false;

  const distFt = distanceFeet(casterEnt.pos, targetEnt.pos);
  // SRD Metamagic Distant Spell — double a ranged spell's range, or make a
  // touch spell reach 30 ft.
  const distant = !!ctx.metamagic?.includes('distant');
  const baseMaxFt = spell.rangeKind === 'touch' ? 5 : (spell.rangeFt ?? 0);
  const maxFt = distant ? (spell.rangeKind === 'touch' ? 30 : baseMaxFt * 2) : baseMaxFt;
  // SRD line of sight — most offensive spells target "a creature you can see".
  // A solid obstacle strictly between caster and target blocks the cast (the
  // slot + action economy already spent are refunded below, same as range).
  // Adjacent targets (distFt ≤ one square) are exempt, matching the attack
  // path and coverBonus — a corner can't block a point-blank cast.
  const blockedLoS =
    distFt <= maxFt &&
    distFt > SQUARE_SIZE &&
    !hasLineOfSight(casterEnt.pos, targetEnt.pos, ctx.roomObstacleCells ?? []);
  if (distFt <= maxFt && !blockedLoS) return false;

  ctx.narrative = blockedLoS
    ? `${spell.name} has no line of sight to the ${spellTargetName} — something solid blocks the way.`
    : spell.rangeKind === 'touch'
      ? `${spell.name} requires a touch — the ${spellTargetName} is ${distFt} ft away.`
      : `${spell.name} is out of range (${distFt} ft to target, max ${maxFt} ft).`;
  // Refund the slot we just spent (free casts — Divine Intervention,
  // Magic Initiate — never spent one, so there's nothing to credit back)
  if (spell.level > 0 && !isRitualCast && !freeCast) {
    const slotsUsedRefund = pc.char.spell_slots_used?.[slotLevel] ?? 1;
    pc.char.spell_slots_used = {
      ...(pc.char.spell_slots_used ?? {}),
      [slotLevel]: Math.max(0, slotsUsedRefund - 1),
    };
  }
  // Refund the action economy too
  if (spell.castTime === 'bonus_action') {
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: false };
  } else {
    pc.char.turn_actions = { ...pc.char.turn_actions, action_used: false };
  }
  if (spell.level > 0 && !isRitualCast) {
    pc.char.turn_actions = { ...pc.char.turn_actions, leveled_spell_cast: false };
  }
  return true;
}
