import type { Character, Spell } from '../types.js';
import { abilityMod } from './rulesEngine.js';
import { getClassLevel } from './multiclass.js';

// SRD: Druid class features (base class and Circle of the Land) that read off
// character state at use time.

/** SRD Druid cantrips are on the Primal list. */
function isDruidCantrip(spell: Pick<Spell, 'level'> & { spellList?: ReadonlyArray<string> }) {
  return spell.level === 0 && (spell.spellList?.includes('primal') ?? false);
}

/**
 * SRD Wild Shape — "No Spellcasting": a Druid in a Wild Shape form can't cast
 * spells. Beast Spells (L18) lifts that, except for a spell whose Material
 * component has a cost or is consumed. Spell-driven shapeshifts (Shapechange,
 * Animal Shapes) aren't Wild Shape and aren't gated here.
 */
export function wildShapeBlocksCasting(
  char: Pick<
    Character,
    'conditions' | 'shapeshift_spell' | 'class_levels' | 'character_class' | 'level'
  >,
  spell?: Pick<Spell, 'materialCost'>
): boolean {
  if (!char.conditions.includes('wild_shaped') || char.shapeshift_spell) return false;
  if (getClassLevel(char as Character, 'druid') < 18) return true;
  return (spell?.materialCost ?? 0) > 0;
}

/**
 * SRD Primal Order (Magician) — +WIS (minimum +1) to Intelligence (Arcana or
 * Nature) checks.
 */
export function magicianCheckBonus(char: Character, skill: string): number {
  return char.primal_order === 'magician' && (skill === 'arcana' || skill === 'nature')
    ? Math.max(1, abilityMod(char.wis))
    : 0;
}

/**
 * SRD Improved Elemental Fury (Potent Spellcasting, L15) — a Druid cantrip with
 * a range of 10+ ft reaches 300 ft farther.
 */
export function druidCantripRangeBonus(
  char: Character,
  spell: Pick<Spell, 'level' | 'rangeFt'> & { spellList?: ReadonlyArray<string> }
): number {
  return char.elemental_fury === 'potent_spellcasting' &&
    getClassLevel(char, 'druid') >= 15 &&
    isDruidCantrip(spell) &&
    (spell.rangeFt ?? 0) >= 10
    ? 300
    : 0;
}

/** SRD Elemental Fury (Primal Strike) — the extra die: 1d8, 2d8 at L15. */
export function primalStrikeDie(char: Character): string | null {
  if (char.elemental_fury !== 'primal_strike') return null;
  const lvl = getClassLevel(char, 'druid');
  return lvl >= 15 ? '2d8' : lvl >= 7 ? '1d8' : null;
}

const PRIMAL_STRIKE_TYPES = ['cold', 'fire', 'lightning', 'thunder'] as const;

/**
 * Primal Strike's damage type, chosen on the hit (AI policy): one the target is
 * Vulnerable to, else one it doesn't resist or ignore, else Thunder.
 */
export function primalStrikeType(target: {
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
}): (typeof PRIMAL_STRIKE_TYPES)[number] {
  const vuln = PRIMAL_STRIKE_TYPES.find((t) => target.vulnerabilities?.includes(t));
  if (vuln) return vuln;
  const clean = PRIMAL_STRIKE_TYPES.find(
    (t) => !target.resistances?.includes(t) && !target.immunities?.includes(t)
  );
  return clean ?? 'thunder';
}

/**
 * SRD Circle of the Land — Nature's Ward (L10): Resistance to the damage type
 * of the current land (Arid Fire, Polar Cold, Temperate Lightning, Tropical
 * Poison). Its Poisoned immunity is read in `conditionImmunitiesFor`.
 */
export function naturesWardResistance(char: Character): string | null {
  if (char.subclass !== 'land' || getClassLevel(char, 'druid') < 10 || !char.circle_land) {
    return null;
  }
  return { arid: 'fire', polar: 'cold', temperate: 'lightning', tropical: 'poison' }[
    char.circle_land
  ];
}

export function hasNaturesWard(char: Character): boolean {
  return char.subclass === 'land' && getClassLevel(char, 'druid') >= 10;
}
