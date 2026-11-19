import type { Character, GameState, Spell, SpellZone } from '../types.js';
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

// ── Nature's Sanctuary (Circle of the Land L14) ─────────────────────────────

/** `SpellZone.spellId` of a Nature's Sanctuary cube. */
export const NATURES_SANCTUARY_ID = 'natures_sanctuary';
/** The cube's footprint radius for `zoneCells`: 10 ft → a 3×3 (15-ft) square. */
export const NATURES_SANCTUARY_RADIUS_FT = 10;
/** How far the cube can be placed from, and moved by, the Druid. */
export const NATURES_SANCTUARY_RANGE_FT = 120;
export const NATURES_SANCTUARY_MOVE_FT = 60;

/** SRD Nature's Sanctuary — a Circle of the Land Druid of level 14+. */
export function hasNaturesSanctuary(char: Character): boolean {
  return char.subclass === 'land' && getClassLevel(char, 'druid') >= 14;
}

const INCAPACITATING = ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'];

/**
 * Whether a sanctuary cube is still standing: it ends early if its Druid dies
 * or has the Incapacitated condition (or one that includes it).
 */
export function sanctuaryStands(st: GameState, zone: SpellZone): boolean {
  const druid = st.characters.find((c) => c.id === zone.casterId);
  if (!druid || druid.dead || druid.hp <= 0) return false;
  return !(druid.conditions ?? []).some((c) => INCAPACITATING.includes(c));
}

/** The standing sanctuary (if any) covering the PC `charId`'s grid cell. */
export function sanctuaryAt(st: GameState, charId: string): SpellZone | undefined {
  const ent = st.entities?.find((e) => e.id === charId && !e.isEnemy);
  if (!ent) return undefined;
  return (st.spell_zones ?? []).find(
    (z) =>
      z.spellId === NATURES_SANCTUARY_ID &&
      z.roomId === st.current_room &&
      z.cells.some((c) => c.x === ent.pos.x && c.y === ent.pos.y) &&
      sanctuaryStands(st, z)
  );
}

/**
 * SRD Nature's Sanctuary — the Druid and allies inside the cube have Half
 * Cover (+2 AC). Returns the AC bonus for the PC `charId`.
 */
export function sanctuaryCoverAc(st: GameState, charId: string): number {
  return sanctuaryAt(st, charId) ? 2 : 0;
}

/**
 * SRD Nature's Sanctuary — allies inside the cube gain the Druid's current
 * Nature's Ward Resistance. Returns that damage type for `char`, or null (the
 * Druid already has the Ward, so it gets nothing extra here).
 */
export function sanctuaryResistance(st: GameState, char: Character): string | null {
  const zone = sanctuaryAt(st, char.id);
  if (!zone || zone.casterId === char.id) return null;
  const druid = st.characters.find((c) => c.id === zone.casterId);
  return druid ? naturesWardResistance(druid) : null;
}
