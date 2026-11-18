import type { Character, LootItem } from '../types.js';
import { wearingBodyArmor, wieldingShield } from './armorClass.js';
import { getClassLevel } from './multiclass.js';

/** SRD Monk Martial Arts die size by Monk level — d6 / d8 / d10 / d12 at 1 / 5 / 11 / 17. */
export function martialArtsDieSides(monkLevel: number): number {
  return monkLevel >= 17 ? 12 : monkLevel >= 11 ? 10 : monkLevel >= 5 ? 8 : 6;
}

/** No armor and no Shield — the gate on the Monk's unarmored features. */
export function monkUnarmored(char: Character, lootTable: LootItem[]): boolean {
  return !wearingBodyArmor(char, lootTable) && !wieldingShield(char);
}

/**
 * SRD Monk Unarmored Movement (L2) — Speed bonus while wearing no armor and
 * wielding no Shield, per the Monk Features table: +10 ft at L2, +15 at L6,
 * +20 at L10, +25 at L14, +30 at L18.
 */
export function unarmoredMovementBonus(char: Character, lootTable: LootItem[]): number {
  const lvl = getClassLevel(char, 'monk');
  if (lvl < 2 || !monkUnarmored(char, lootTable)) return 0;
  return lvl >= 18 ? 30 : lvl >= 14 ? 25 : lvl >= 10 ? 20 : lvl >= 6 ? 15 : 10;
}

/**
 * SRD Monk Acrobatic Movement (L9) — while wearing no armor and wielding no
 * Shield, the Monk can move along vertical surfaces and across liquids on its
 * turn without falling.
 */
export function hasAcrobaticMovement(char: Character, lootTable: LootItem[]): boolean {
  return getClassLevel(char, 'monk') >= 9 && monkUnarmored(char, lootTable);
}

/**
 * SRD Monk Slow Fall (L4) — a Reaction when falling reduces the fall's damage
 * by 5 × Monk level. Returns the reduction (0 below Monk 4).
 */
export function slowFallReduction(char: Character): number {
  const lvl = getClassLevel(char, 'monk');
  return lvl >= 4 ? 5 * lvl : 0;
}

/** SRD Monk Heightened Focus (L10) — Flurry of Blows / Patient Defense / Step of the Wind upgrades. */
export function hasHeightenedFocus(char: Character): boolean {
  return getClassLevel(char, 'monk') >= 10;
}
