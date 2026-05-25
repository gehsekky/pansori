import {
  FIGHTING_STYLE_IDS,
  FIGHTING_STYLE_LABELS,
  type FightingStyleId,
  defenseAcBonus,
  fightingStyleSlots,
} from '../fightingStyle.js';
import { applyFeatTake, canTakeFeat, getFeat } from '../feats.js';
import { applyLevelUpForClass, mergeDraconicSpells, preparedSpellsCap } from '../gameEngine.js';
import {
  canMulticlassInto,
  evocationSavantBudget,
  expertiseEligibleSkills,
  expertiseSlots,
  getClassLevel,
  hasClass,
  hunterFeatureOptions,
  isEvocationSpell,
  knowsMetamagic,
  metamagicOptions,
  metamagicSlots,
} from '../multiclass.js';
import type { AbilityKey } from '../../types.js';
import type { ActionHandler } from './types.js';
import { updatePcActor } from './actor.js';

/**
 * `apply_asi`: spend a pending Ability Score Improvement (granted by
 * `applyLevelUpFromXp` at the appropriate levels). +2 to the chosen
 * stat. CON increases retroactively raise max HP across every level
 * (PHB convention).
 */
export const handleApplyAsi: ActionHandler<{ type: 'apply_asi'; stat: AbilityKey }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can improve ability scores.' };
  const { char } = ctx.actor;
  if (!char.asi_pending) {
    ctx.narrative = 'No Ability Score Improvement pending.';
    return;
  }
  const stat = action.stat;
  const next = { ...char, asi_pending: false } as typeof char;
  next[stat] = (char[stat] ?? 10) + 2;
  const statName = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }[stat];
  let narrative = `${next.name} increases ${statName} by 2 (now ${next[stat]})!`;
  if (stat === 'con') {
    const bonus = Math.floor((next.con - 10) / 2) - Math.floor((next.con - 2 - 10) / 2);
    next.max_hp = Math.max(1, next.max_hp + bonus * next.level);
    next.hp = Math.min(next.max_hp, next.hp + bonus * next.level);
    if (bonus > 0)
      narrative += ` Max HP increased by ${bonus * next.level} (${bonus}/level × ${next.level} levels).`;
  }
  updatePcActor(ctx, next);
  ctx.narrative = narrative;
};

/**
 * `select_subclass`: pick a subclass at level 1 (Cleric/Sorcerer/
 * Warlock) or later (other classes — L2 Wizard/Druid, L3 for the
 * rest). Idempotent: re-selecting a chosen subclass is rejected.
 * Sorcerer Draconic Bloodline retroactively grants +1 HP / sorcerer
 * level when picked mid-game.
 */
export const handleSelectSubclass: ActionHandler<{ type: 'select_subclass'; subclass: string }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose a subclass.' };
  const { char } = ctx.actor;
  if (char.subclass) {
    ctx.narrative = `You have already chosen the ${char.subclass} subclass.`;
    return;
  }
  const next = { ...char, subclass: action.subclass };
  let narrative = `${next.name} follows the path of the ${action.subclass}!`;
  if (action.subclass === 'draconic' && hasClass(next, 'sorcerer')) {
    // Draconic Resilience scales with Sorcerer level only.
    const sorcLvl = getClassLevel(next, 'sorcerer');
    next.max_hp += sorcLvl;
    next.hp += sorcLvl;
    narrative += ` Draconic Resilience: +${sorcLvl} max HP (now ${next.hp}/${next.max_hp}).`;
    // Draconic Spells — grant the always-prepared spells for the current level.
    const before = (next.spells_known ?? []).length;
    next.spells_known = mergeDraconicSpells(next);
    if (next.spells_known.length > before) narrative += ` 🐉 Draconic Spells added.`;
  }
  updatePcActor(ctx, next);
  ctx.narrative = narrative;
};

/**
 * `choose_fighting_style`: pick a SRD Fighting Style feat granted by a
 * class feature (Fighter L1/L7, Paladin/Ranger L2). Validates the style
 * id, rejects duplicates, and enforces the per-character slot count
 * (`fightingStyleSlots`). Out-of-combat, no action cost. (RE-2.)
 */
export const handleChooseFightingStyle: ActionHandler<{
  type: 'choose_fighting_style';
  style: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose a Fighting Style.' };
  const { char } = ctx.actor;
  const style = action.style as FightingStyleId;
  if (!FIGHTING_STYLE_IDS.includes(style)) {
    return { rejected: `Unknown Fighting Style: ${action.style}.` };
  }
  const current = char.fighting_styles ?? [];
  if (current.includes(style)) {
    ctx.narrative = `You already have the ${FIGHTING_STYLE_LABELS[style] ?? style} Fighting Style.`;
    return;
  }
  if (current.length >= fightingStyleSlots(char)) {
    ctx.narrative = 'You have no Fighting Style choice available right now.';
    return;
  }
  const nextStyles = [...current, style];
  const patch: { fighting_styles: string[]; ac?: number } = { fighting_styles: nextStyles };
  // Defense (+1 AC while armored) feeds computeTotalAc post-steps; recompute
  // the stored AC now so the change shows immediately on pick.
  if (style === 'defense') {
    patch.ac =
      (char.ac ?? 10) +
      defenseAcBonus({ ...char, fighting_styles: nextStyles }, ctx.context.lootTable);
  }
  updatePcActor(ctx, patch);
  ctx.narrative = `${char.name} adopts the ${FIGHTING_STYLE_LABELS[style] ?? style} Fighting Style.`;
};

/**
 * `choose_hunter_option`: pick one of the two options for a Ranger Hunter
 * "feature option" feature — Hunter's Prey (L3: Colossus Slayer / Horde
 * Breaker) or Defensive Tactics (L7: Escape the Horde / Multiattack Defense).
 * Swappable on a rest, so it's an always-available out-of-combat choice.
 * Validates the Hunter subclass + gate level + the option id. (RE-2.)
 */
export const handleChooseHunterOption: ActionHandler<{
  type: 'choose_hunter_option';
  feature: 'hunters_prey' | 'defensive_tactics';
  option: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose a Hunter option.' };
  const { char } = ctx.actor;
  const def = hunterFeatureOptions[action.feature];
  if (!def) return { rejected: `Unknown Hunter feature: ${action.feature}.` };
  if (char.subclass !== 'hunter' || getClassLevel(char, 'ranger') < def.level) {
    ctx.narrative = `${def.feature} requires a Hunter Ranger of level ${def.level}.`;
    return;
  }
  if (!def.options.includes(action.option)) {
    return { rejected: `Unknown ${def.feature} option: ${action.option}.` };
  }
  updatePcActor(
    ctx,
    action.feature === 'hunters_prey'
      ? { hunters_prey: action.option as 'colossus_slayer' | 'horde_breaker' }
      : { defensive_tactics: action.option as 'escape_the_horde' | 'multiattack_defense' }
  );
  ctx.narrative = `${char.name} adopts ${def.labels[action.option] ?? action.option}.`;
};

/**
 * `choose_metamagic`: learn a Sorcerer Metamagic option. Validates the
 * Sorcerer class + that a known-slot is open (2/4/6 at sorcerer L2/10/17) +
 * the option id + no duplicate. Out-of-combat, no action cost. (RE-2.)
 */
export const handleChooseMetamagic: ActionHandler<{ type: 'choose_metamagic'; option: string }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can learn Metamagic.' };
  const { char } = ctx.actor;
  if (!hasClass(char, 'sorcerer')) {
    ctx.narrative = 'Only Sorcerers have Metamagic.';
    return;
  }
  if (!metamagicOptions[action.option]) {
    return { rejected: `Unknown Metamagic option: ${action.option}.` };
  }
  if (knowsMetamagic(char, action.option)) {
    ctx.narrative = `You already know ${metamagicOptions[action.option].label}.`;
    return;
  }
  const known = char.metamagics_known ?? [];
  if (known.length >= metamagicSlots(char)) {
    ctx.narrative = 'You have no Metamagic option to learn right now.';
    return;
  }
  updatePcActor(ctx, { metamagics_known: [...known, action.option] });
  ctx.narrative = `${char.name} learns ${metamagicOptions[action.option].label} Metamagic.`;
};

/**
 * `choose_elemental_affinity`: SRD Draconic Sorcery (L6) — pick the affinity
 * damage type (the sorcerer resists it + adds CHA to one damage roll of it).
 * One-time choice; validated to a Draconic Sorcerer L6+. Out-of-combat. (RE-2.)
 */
export const handleChooseElementalAffinity: ActionHandler<{
  type: 'choose_elemental_affinity';
  damageType: 'acid' | 'cold' | 'fire' | 'lightning' | 'poison';
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Elemental Affinity.' };
  const { char } = ctx.actor;
  if (char.subclass !== 'draconic' || getClassLevel(char, 'sorcerer') < 6) {
    ctx.narrative = 'Elemental Affinity requires a Draconic Sorcerer of level 6.';
    return;
  }
  if (!['acid', 'cold', 'fire', 'lightning', 'poison'].includes(action.damageType)) {
    return { rejected: `Invalid Elemental Affinity type: ${action.damageType}.` };
  }
  updatePcActor(ctx, { elemental_affinity: action.damageType });
  ctx.narrative = `${char.name} attunes to ${action.damageType} — Elemental Affinity: resistance to ${action.damageType}, and +CHA to one ${action.damageType} damage roll per spell.`;
};

/**
 * `choose_blessed_strikes`: SRD Cleric (L7) — choose Divine Strike (extra
 * radiant/necrotic on a weapon hit, once/turn) or Potent Spellcasting (+WIS to
 * Cleric cantrip damage). Gated to a Cleric L7+. Out-of-combat. (RE-2.)
 */
export const handleChooseBlessedStrikes: ActionHandler<{
  type: 'choose_blessed_strikes';
  option: 'divine_strike' | 'potent_spellcasting';
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Blessed Strikes.' };
  const { char } = ctx.actor;
  if (!hasClass(char, 'cleric') || getClassLevel(char, 'cleric') < 7) {
    ctx.narrative = 'Blessed Strikes requires a Cleric of level 7.';
    return;
  }
  if (action.option !== 'divine_strike' && action.option !== 'potent_spellcasting') {
    return { rejected: `Unknown Blessed Strikes option: ${action.option}.` };
  }
  updatePcActor(ctx, { blessed_strikes: action.option });
  ctx.narrative =
    action.option === 'divine_strike'
      ? `${char.name} channels Divine Strike — weapon hits deal extra radiant damage once per turn.`
      : `${char.name} channels Potent Spellcasting — Cleric cantrips deal +WIS damage.`;
};

/**
 * `choose_divine_order`: SRD Cleric (L1) — choose Protector (gain Martial
 * weapon + Heavy armor training) or Thaumaturge (learn an extra Cleric cantrip
 * via `cantrip` + add WIS, min +1, to Intelligence (Arcana/Religion) checks).
 * Gated to a Cleric. Out-of-combat, no action cost. (RE-2.)
 */
export const handleChooseDivineOrder: ActionHandler<{
  type: 'choose_divine_order';
  option: 'protector' | 'thaumaturge';
  cantrip?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Divine Order.' };
  const { char } = ctx.actor;
  if (!hasClass(char, 'cleric')) {
    ctx.narrative = 'Only Clerics have Divine Order.';
    return;
  }
  if (action.option === 'protector') {
    const weapons = char.weapon_proficiencies.includes('martial')
      ? char.weapon_proficiencies
      : [...char.weapon_proficiencies, 'martial'];
    const armor = char.armor_proficiencies.includes('heavy')
      ? char.armor_proficiencies
      : [...char.armor_proficiencies, 'heavy'];
    updatePcActor(ctx, {
      divine_order: 'protector',
      weapon_proficiencies: weapons,
      armor_proficiencies: armor,
    });
    ctx.narrative = `${char.name} takes the Protector order — trained with Martial weapons and Heavy armor.`;
    return;
  }
  if (action.option === 'thaumaturge') {
    let learned: string | undefined;
    if (action.cantrip) {
      const spell = ctx.context.spellTable?.[action.cantrip];
      const isClericCantrip =
        spell?.level === 0 &&
        ((spell as { spellList?: ReadonlyArray<string> }).spellList?.includes('divine') ?? false);
      if (!isClericCantrip) {
        return { rejected: `${action.cantrip} isn't a Cleric cantrip.` };
      }
      if (!(char.spells_known ?? []).includes(action.cantrip)) learned = action.cantrip;
    }
    updatePcActor(ctx, {
      divine_order: 'thaumaturge',
      spells_known: learned ? [...(char.spells_known ?? []), learned] : char.spells_known,
    });
    ctx.narrative = learned
      ? `${char.name} takes the Thaumaturge order — learns ${ctx.context.spellTable![action.cantrip!].name} and adds WIS to Arcana/Religion checks.`
      : `${char.name} takes the Thaumaturge order — adds WIS to Arcana/Religion checks.`;
    return;
  }
  return { rejected: `Unknown Divine Order option: ${action.option}.` };
};

/**
 * `choose_spell_mastery`: SRD Wizard (L18) — designate a level-1 (tier 1) or
 * level-2 (tier 2) spell with a casting time of an action as mastered; it can
 * then be cast at its base level without a slot. Gated to a Wizard L18.
 * Out-of-combat, no action cost. (RE-2.)
 */
export const handleChooseSpellMastery: ActionHandler<{
  type: 'choose_spell_mastery';
  tier: 1 | 2;
  spellId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Spell Mastery.' };
  const { char } = ctx.actor;
  if (!hasClass(char, 'wizard') || getClassLevel(char, 'wizard') < 18) {
    ctx.narrative = 'Spell Mastery requires a Wizard of level 18.';
    return;
  }
  const spell = ctx.context.spellTable?.[action.spellId];
  if (!spell || spell.level !== action.tier) {
    return { rejected: `${action.spellId} isn't a level-${action.tier} spell.` };
  }
  if (spell.castTime !== 'action') {
    return { rejected: `${spell.name} must have a casting time of an action for Spell Mastery.` };
  }
  if (!(char.spells_known ?? []).includes(action.spellId)) {
    return { rejected: `${spell.name} isn't in your spellbook.` };
  }
  updatePcActor(
    ctx,
    action.tier === 1 ? { spell_mastery_l1: action.spellId } : { spell_mastery_l2: action.spellId }
  );
  ctx.narrative = `${char.name} masters ${spell.name} — castable at level ${action.tier} without a slot.`;
};

/**
 * `choose_signature_spell`: SRD Wizard (L20) — designate a level-3 spell as a
 * signature spell (up to two). Each can be cast once at level 3 without a slot,
 * recharging on a short/long rest. Gated to a Wizard L20. Out-of-combat. (RE-2.)
 */
export const handleChooseSignatureSpell: ActionHandler<{
  type: 'choose_signature_spell';
  spellId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Signature Spells.' };
  const { char } = ctx.actor;
  if (!hasClass(char, 'wizard') || getClassLevel(char, 'wizard') < 20) {
    ctx.narrative = 'Signature Spells requires a Wizard of level 20.';
    return;
  }
  const spell = ctx.context.spellTable?.[action.spellId];
  if (!spell || spell.level !== 3) {
    return { rejected: `${action.spellId} isn't a level-3 spell.` };
  }
  if (!(char.spells_known ?? []).includes(action.spellId)) {
    return { rejected: `${spell.name} isn't in your spellbook.` };
  }
  const current = char.signature_spells ?? [];
  if (current.includes(action.spellId)) {
    ctx.narrative = `${spell.name} is already a signature spell.`;
    return;
  }
  if (current.length >= 2) {
    ctx.narrative = 'You already have two signature spells.';
    return;
  }
  updatePcActor(ctx, { signature_spells: [...current, action.spellId] });
  ctx.narrative = `${char.name} marks ${spell.name} as a signature spell — a free level-3 cast each rest.`;
};

/**
 * `choose_evocation_savant`: SRD Evoker (L3) — add a free Wizard Evocation
 * spell to the spellbook. Budget is 2 at L3 + 1 per new spell-slot level
 * (`evocationSavantBudget`), tracked against `evocation_savant_claimed`. The
 * spell must be an arcane Evocation spell of a level the wizard has slots for.
 * Out-of-combat, no action cost. (RE-2.)
 */
export const handleChooseEvocationSavant: ActionHandler<{
  type: 'choose_evocation_savant';
  spellId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Evocation Savant.' };
  const { char } = ctx.actor;
  if (!(char.subclass === 'evoker' && getClassLevel(char, 'wizard') >= 3)) {
    ctx.narrative = 'Evocation Savant requires an Evoker of level 3.';
    return;
  }
  const claimed = char.class_resource_uses?.evocation_savant_claimed ?? 0;
  if (claimed >= evocationSavantBudget(char)) {
    ctx.narrative = 'No free Evocation spells available right now.';
    return;
  }
  const spell = ctx.context.spellTable?.[action.spellId];
  const maxSlot = Math.max(0, ...Object.keys(char.spell_slots_max ?? {}).map(Number));
  const eligible =
    !!spell &&
    spell.level >= 1 &&
    spell.level <= maxSlot &&
    isEvocationSpell(spell) &&
    ((spell as { spellList?: ReadonlyArray<string> }).spellList?.includes('arcane') ?? false);
  if (!eligible) {
    return { rejected: `${action.spellId} isn't an eligible Wizard Evocation spell.` };
  }
  if ((char.spells_known ?? []).includes(action.spellId)) {
    ctx.narrative = `${spell!.name} is already in your spellbook.`;
    return;
  }
  updatePcActor(ctx, {
    spells_known: [...(char.spells_known ?? []), action.spellId],
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      evocation_savant_claimed: claimed + 1,
    },
  });
  ctx.narrative = `${char.name} inscribes ${spell!.name} into the spellbook (Evocation Savant).`;
};

/**
 * `choose_fiendish_resilience`: SRD Fiend Warlock (L10) — gain Resistance to a
 * chosen damage type (anything but Force), re-chooseable on a rest. Gated to a
 * Fiend Warlock L10. Out-of-combat, no action cost. (RE-2.)
 */
export const handleChooseFiendishResilience: ActionHandler<{
  type: 'choose_fiendish_resilience';
  damageType: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Fiendish Resilience.' };
  const { char } = ctx.actor;
  if (!(char.subclass === 'fiend' && getClassLevel(char, 'warlock') >= 10)) {
    ctx.narrative = 'Fiendish Resilience requires a Fiend Warlock of level 10.';
    return;
  }
  if (action.damageType === 'force') {
    return { rejected: 'Fiendish Resilience cannot be set to Force damage.' };
  }
  updatePcActor(ctx, { fiendish_resilience: action.damageType });
  ctx.narrative = `${char.name} hardens against ${action.damageType} — Resistance to ${action.damageType} damage until they choose otherwise.`;
};

/**
 * `choose_mystic_arcanum`: SRD Warlock (L11/13/15/17) — designate a level 6-9
 * spell as the arcanum for its tier; it can then be cast once per long rest
 * without a slot. Gated to the Warlock level for that tier (11/13/15/17).
 * Out-of-combat, no action cost. (RE-2.)
 */
export const handleChooseMysticArcanum: ActionHandler<{
  type: 'choose_mystic_arcanum';
  spellId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose a Mystic Arcanum.' };
  const { char } = ctx.actor;
  const spell = ctx.context.spellTable?.[action.spellId];
  if (!spell || spell.level < 6 || spell.level > 9) {
    return { rejected: `${action.spellId} isn't a level 6-9 spell.` };
  }
  const tierGate: Record<number, number> = { 6: 11, 7: 13, 8: 15, 9: 17 };
  if (getClassLevel(char, 'warlock') < (tierGate[spell.level] ?? 99)) {
    ctx.narrative = `A level-${spell.level} Mystic Arcanum requires a higher Warlock level.`;
    return;
  }
  updatePcActor(ctx, {
    mystic_arcanum: { ...(char.mystic_arcanum ?? {}), [spell.level]: action.spellId },
  });
  ctx.narrative = `${char.name} inscribes ${spell.name} as their level-${spell.level} Mystic Arcanum — castable once per long rest without a slot.`;
};

/**
 * `memorize_spell`: SRD Wizard (L5) — during a rest, replace one prepared
 * level-1+ spell with another level-1+ spell from the spellbook. Gated to a
 * Wizard L5, out of combat. (RE-2.)
 */
export const handleMemorizeSpell: ActionHandler<{
  type: 'memorize_spell';
  swapOut: string;
  swapIn: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can memorize spells.' };
  const { char } = ctx.actor;
  if (!hasClass(char, 'wizard') || getClassLevel(char, 'wizard') < 5) {
    ctx.narrative = 'Memorize Spell requires a Wizard of level 5.';
    return;
  }
  if (ctx.st.combat_active) {
    ctx.narrative = 'You can only study your spellbook during a rest, not in combat.';
    return;
  }
  const prepared = char.prepared_spells ?? [];
  if (!prepared.includes(action.swapOut)) {
    return { rejected: `${action.swapOut} isn't one of your prepared spells.` };
  }
  const outSpell = ctx.context.spellTable?.[action.swapOut];
  const inSpell = ctx.context.spellTable?.[action.swapIn];
  if (!inSpell || inSpell.level < 1) {
    return { rejected: `${action.swapIn} isn't a level 1+ spell.` };
  }
  if (!(char.spells_known ?? []).includes(action.swapIn)) {
    return { rejected: `${inSpell.name} isn't in your spellbook.` };
  }
  if (prepared.includes(action.swapIn)) {
    ctx.narrative = `${inSpell.name} is already prepared.`;
    return;
  }
  updatePcActor(ctx, {
    prepared_spells: [...prepared.filter((s) => s !== action.swapOut), action.swapIn],
  });
  ctx.narrative = `${char.name} studies the spellbook — swaps ${outSpell?.name ?? action.swapOut} for ${inSpell.name}.`;
};

/**
 * `choose_expertise`: pick a skill proficiency to gain Expertise in (double
 * proficiency bonus). Granted by Rogue (L1 + L6) and Bard (L2 + L9). Validates
 * that the skill is one the character is proficient in, isn't already an
 * Expertise pick, and that a slot is open (`expertiseSlots`). Out-of-combat,
 * no action cost. (RE-2.)
 */
export const handleChooseExpertise: ActionHandler<{
  type: 'choose_expertise';
  skill: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can choose Expertise.' };
  const { char } = ctx.actor;
  const match = (char.skill_proficiencies ?? []).find(
    (s) => s.toLowerCase() === action.skill.toLowerCase()
  );
  if (!match) {
    return {
      rejected: `You aren't proficient in ${action.skill}, so you can't gain Expertise in it.`,
    };
  }
  // SRD Wizard Scholar (L2) restricts Expertise to a knowledge skill; Rogue/
  // Bard Expertise allows any proficient skill. `expertiseEligibleSkills`
  // encodes the per-character rule.
  if (!expertiseEligibleSkills(char).some((s) => s.toLowerCase() === match.toLowerCase())) {
    return {
      rejected: `${match} isn't an eligible Expertise skill for you (Scholar is limited to a knowledge skill).`,
    };
  }
  const current = char.expertise_skills ?? [];
  if (current.some((s) => s.toLowerCase() === match.toLowerCase())) {
    ctx.narrative = `You already have Expertise in ${match}.`;
    return;
  }
  if (current.length >= expertiseSlots(char)) {
    ctx.narrative = 'You have no Expertise choice available right now.';
    return;
  }
  updatePcActor(ctx, { expertise_skills: [...current, match] });
  ctx.narrative = `${char.name} gains Expertise in ${match} (double proficiency bonus).`;
};

/**
 * `set_active_character`: out-of-combat "lead picker". Hands the
 * spotlight to a different living PC for subsequent narrative
 * attribution + skill checks. No-op in combat (initiative drives
 * `active_character_id` there). Does NOT consume a turn — sets
 * `usedInitiative = false` so initiative is not advanced.
 */
export const handleSetActiveCharacter: ActionHandler<{
  type: 'set_active_character';
  characterId: string;
}> = (ctx, action) => {
  if (ctx.st.combat_active) {
    ctx.narrative = `Initiative is rolled — you can't hand the spotlight off mid-fight.`;
    return;
  }
  const target = ctx.st.characters.find((c) => c.id === action.characterId);
  if (!target) {
    ctx.narrative = 'Unknown party member.';
    return;
  }
  if (target.dead) {
    ctx.narrative = `${target.name} is dead and can't lead.`;
    return;
  }
  ctx.st = { ...ctx.st, active_character_id: action.characterId };
  ctx.narrative = `${target.name} steps forward to lead.`;
  ctx.usedInitiative = false;
};

/**
 * `prepare_spells`: pick which leveled spells are prepared for the
 * day. Cantrips are always known (PHB p.234) so they're stripped from
 * input. Cap = level + spellcasting modifier (preparedSpellsCap).
 * Out-of-combat only.
 */
export const handlePrepareSpells: ActionHandler<{
  type: 'prepare_spells';
  spellIds: string[];
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can prepare spells.' };
  const { char } = ctx.actor;
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot prepare spells during combat.';
    return;
  }
  const maxPrepared = preparedSpellsCap(char, ctx.context);
  const leveledIds = action.spellIds.filter((id) => (ctx.context.spellTable?.[id]?.level ?? 0) > 0);
  if (leveledIds.length > maxPrepared) {
    ctx.narrative = `You can prepare at most ${maxPrepared} leveled spells (your level + spellcasting modifier). You tried to prepare ${leveledIds.length}.`;
    return;
  }
  updatePcActor(ctx, { prepared_spells: leveledIds });
  const spellNames = leveledIds.map((id) => ctx.context.spellTable?.[id]?.name ?? id).join(', ');
  ctx.narrative = `${char.name} prepares their spells for the day: ${spellNames || '(none)'}.`;
};

/**
 * `take_feat`: choose a feat. Surfaced at character creation (origin
 * feats from background) and at ASI levels (general feats replace the
 * +2 ability bump). The handler runs the prereq check, then applies
 * take-time bonuses via `applyFeatTake` (HP grant for Tough, +1
 * ability for half-feats, save profs for Resilient, etc.). Active-
 * effect feats (Lucky, Sharpshooter) only register here; their
 * runtime hooks fire at the relevant gameplay moment in follow-up
 * PRs.
 *
 * `asi_pending` is consumed when the feat is taken in lieu of an ASI.
 * Origin feats from backgrounds don't consume it; the FE picks the
 * right scope when surfacing the action.
 */
export const handleTakeFeat: ActionHandler<{
  type: 'take_feat';
  featId: string;
  abilityChoice?: AbilityKey;
  saveProficiencyChoices?: AbilityKey[];
  cantripChoices?: string[];
  l1Choice?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take a feat.' };
  const { char } = ctx.actor;
  const feat = getFeat(action.featId, ctx.context);
  if (!feat) {
    ctx.narrative = `Unknown feat: ${action.featId}.`;
    return;
  }
  const fail = canTakeFeat(char, feat);
  if (fail) {
    ctx.narrative = fail;
    return;
  }
  // Half-feats with player-chosen ability need a pick.
  if (feat.abilityBonus && 'choices' in feat.abilityBonus && !action.abilityChoice) {
    ctx.narrative = `${feat.name} is a half-feat — pick an ability for the +1 bonus.`;
    return;
  }
  // Magic Initiate — validate that the chosen cantrips + L1 spell
  // exist, are the right level, and belong to the feat's spell list.
  if (feat.effect.kind === 'extra-cantrips-and-l1' && (action.cantripChoices || action.l1Choice)) {
    const list = feat.effect.spellList;
    const cantripCount = feat.effect.cantripCount;
    const cantrips = action.cantripChoices ?? [];
    if (cantrips.length !== cantripCount) {
      ctx.narrative = `${feat.name} requires exactly ${cantripCount} cantrip choice${cantripCount === 1 ? '' : 's'} (got ${cantrips.length}).`;
      return;
    }
    for (const cId of cantrips) {
      const spell = ctx.context.spellTable?.[cId];
      if (!spell) {
        ctx.narrative = `${feat.name}: unknown cantrip "${cId}".`;
        return;
      }
      if (spell.level !== 0) {
        ctx.narrative = `${feat.name}: "${spell.name}" is not a cantrip.`;
        return;
      }
      if (!spell.spellList?.includes(list)) {
        ctx.narrative = `${feat.name}: "${spell.name}" is not on the ${list} spell list.`;
        return;
      }
    }
    if (feat.effect.l1Count > 0) {
      const l1 = action.l1Choice;
      if (!l1) {
        ctx.narrative = `${feat.name} requires a level-1 spell choice.`;
        return;
      }
      const spell = ctx.context.spellTable?.[l1];
      if (!spell) {
        ctx.narrative = `${feat.name}: unknown L1 spell "${l1}".`;
        return;
      }
      if (spell.level !== 1) {
        ctx.narrative = `${feat.name}: "${spell.name}" is not a level-1 spell.`;
        return;
      }
      if (!spell.spellList?.includes(list)) {
        ctx.narrative = `${feat.name}: "${spell.name}" is not on the ${list} spell list.`;
        return;
      }
    }
  }

  const { newChar, narrative } = applyFeatTake(char, feat, {
    abilityChoice: action.abilityChoice,
    cantripChoices: action.cantripChoices,
    l1Choice: action.l1Choice,
  });
  // ASI-slot consumption — only when an ASI was pending (general-feat
  // path). Origin feats from background don't gate on asi_pending.
  const consumeAsi = char.asi_pending && feat.category === 'general';
  updatePcActor(ctx, consumeAsi ? { ...newChar, asi_pending: false } : newChar);
  ctx.narrative = narrative;
};

/**
 * `level_up_class`: manually advance one level, choosing the class
 * to add the level to (2024 PHB multiclassing). Validates:
 *
 *   - XP threshold met for `char.level + 1`.
 *   - Out of combat (RAW: level-ups happen during downtime).
 *   - Total level not yet at the cap (20).
 *   - 2024 PHB multiclass prerequisites for any class other than
 *     `char.character_class` (the primary, taken at creation).
 *
 * On success delegates to `applyLevelUpForClass` which does the
 * mutation (HP gain, slot recompute, ASI gating on per-class level,
 * multiclass proficiency grants on first level in a non-primary
 * class). Out-of-combat only — does not consume an action.
 */
export const handleLevelUpClass: ActionHandler<{ type: 'level_up_class'; className: string }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can level up.' };
  const { char } = ctx.actor;
  if (ctx.st.combat_active) {
    return { rejected: 'You cannot level up during combat.' };
  }
  if ((char.level ?? 1) >= 20) {
    return { rejected: `${char.name} is already at the level cap (20).` };
  }
  // XP threshold: level N → N+1 needs N × 100 XP (same gate as
  // applyLevelUpFromXp).
  if ((char.xp ?? 0) < (char.level ?? 1) * 100) {
    const need = (char.level ?? 1) * 100 - (char.xp ?? 0);
    return { rejected: `${char.name} needs ${need} more XP to level up.` };
  }
  const cls = action.className.toLowerCase();
  // Multiclass prereq check only applies on **entry** to a new class
  // (RAW: subsequent levels in an already-taken class don't re-check
  // the ability minimum). canMulticlassInto returns empty for the
  // primary class so this also covers the single-class continuation.
  if (getClassLevel(char, cls) === 0) {
    const prereqError = canMulticlassInto(char, cls);
    if (prereqError) {
      return { rejected: prereqError };
    }
  }
  // Mutate a working copy so the level-up narrative composes the same
  // way as the auto-level path.
  const next = { ...char };
  const narrative = applyLevelUpForClass(next, cls, ctx.context);
  updatePcActor(ctx, next);
  ctx.narrative = narrative.trim();
  // Mirror applyPartyLevelUps' implicit "uses initiative? no" stance
  // — out-of-combat level-up never advances turn order.
};
