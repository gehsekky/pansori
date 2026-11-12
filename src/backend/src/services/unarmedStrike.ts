import type { Character, CreatureSize, Enemy, GameState } from '../types.js';
import { abilityMod, profBonus, rollConditionSave } from './rulesEngine.js';
import { autoFailsSave, disadvantageOnSave } from './conditions/registry.js';
import { equippedArmorId, equippedShieldId } from './equipment.js';
import { SRD_SPECIES } from '../campaignData/srd/species.js';
import { getClassLevel } from './multiclass.js';
import { legendaryResist } from './monsterSaves.js';

// SRD: Unarmed Strike — the Grapple and Shove options.
//
// The target makes a Strength or Dexterity saving throw (its choice) against
// DC 8 + the attacker's Strength modifier + Proficiency Bonus. A Monk can use
// Dexterity for the DC instead (Dexterous Attacks) while Martial Arts applies.
// Either option works only on a target no more than one size larger than the
// attacker. A grapple's escape DC is the same DC.

const SIZES: CreatureSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

export function sizeRank(size: CreatureSize | undefined): number {
  return SIZES.indexOf(size ?? 'medium');
}

/** A PC's size, from its species (Medium when unknown). */
export function pcSize(char: Pick<Character, 'species'>): CreatureSize {
  return (char.species ? SRD_SPECIES[char.species]?.size : undefined) ?? 'medium';
}

/** Whether the target is small enough to grapple or shove (at most one size larger). */
export function withinUnarmedSizeLimit(
  char: Pick<Character, 'species'>,
  target: Pick<Enemy, 'size'>
): boolean {
  return sizeRank(target.size) - sizeRank(pcSize(char)) <= 1;
}

/**
 * SRD Monk Dexterous Attacks: DEX may set the Grapple/Shove DC. Martial Arts
 * applies only while the Monk wears no armor and holds no Shield.
 */
function dexterousAttacks(char: Character): boolean {
  return getClassLevel(char, 'monk') >= 1 && !equippedArmorId(char) && !equippedShieldId(char);
}

/** The save DC for Grapple / Shove, and for escaping the grapple. */
export function unarmedStrikeDc(char: Character): number {
  const strMod = abilityMod(char.str);
  const mod = dexterousAttacks(char) ? Math.max(strMod, abilityMod(char.dex)) : strMod;
  return 8 + mod + profBonus(char.level);
}

/**
 * The target's STR or DEX save against a Grapple / Shove. The target picks
 * the better ability, counting Advantage / Disadvantage from its conditions
 * as worth about 5. Not magical, so Magic Resistance doesn't apply; Legendary
 * Resistance does (the save would impose a condition).
 */
export function unarmedStrikeSave(
  st: GameState,
  target: Enemy,
  targetConditions: string[],
  dc: number
): { failed: boolean; ability: 'str' | 'dex'; note: string } {
  const score = (a: 'str' | 'dex') => (a === 'str' ? (target.str ?? 10) : (target.dex ?? 10));
  const worth = (a: 'str' | 'dex') => {
    if (autoFailsSave(targetConditions, a)) return -100;
    let v = abilityMod(score(a));
    if (disadvantageOnSave(targetConditions, a)) v -= 5;
    if (a === 'dex' && targetConditions.includes('hasted')) v += 5;
    return v;
  };
  const ability = worth('dex') > worth('str') ? 'dex' : 'str';
  const rolledFail = rollConditionSave(ability, score(ability), dc, false, 1, 0, targetConditions);
  const lr = legendaryResist(st, target, rolledFail);
  return { failed: lr.failed, ability, note: lr.note };
}

/**
 * SRD Grappled — a grappled creature has Disadvantage on attack rolls against
 * any target other than its grappler. `grappledBy` is the attacker's grid
 * entity's `grappled_by`.
 */
export function grappledAttackDisadvantage(
  attackerConditions: string[] | undefined,
  grappledBy: string | undefined,
  targetId: string
): boolean {
  return !!attackerConditions?.includes('grappled') && !!grappledBy && grappledBy !== targetId;
}
