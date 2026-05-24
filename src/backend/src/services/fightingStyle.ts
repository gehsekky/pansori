// SRD 5.2.1 Fighting Style feats. The SRD has exactly four (Archery,
// Defense, Great Weapon Fighting, Two-Weapon Fighting) — Dueling /
// Protection / Blind Fighting / etc. are PHB-only and out of scope.
//
// Granted by class features: Fighter L1 (+ a second at L7 "Additional
// Fighting Style"), Paladin L2, Ranger L2. A character may hold each
// style at most once (RAW: you can't take the same Fighting Style feat
// twice). The chosen ids live on `Character.fighting_styles`; the
// passive effects are applied in the attack/AC pipelines.

import type { Character, LootItem } from '../types.js';
import { getClassLevel } from './multiclass.js';

export const FIGHTING_STYLE_IDS = ['archery', 'defense', 'great_weapon', 'two_weapon'] as const;
export type FightingStyleId = (typeof FIGHTING_STYLE_IDS)[number];

// Styles the choice surface offers — all four SRD Fighting Styles are now
// wired (Archery → ranged to-hit, Two-Weapon → off-hand damage, Defense →
// +1 AC while armored, Great Weapon Fighting → reroll 1s/2s on two-handed
// melee damage).
export const OFFERED_FIGHTING_STYLE_IDS: FightingStyleId[] = [
  'archery',
  'defense',
  'great_weapon',
  'two_weapon',
];

export const FIGHTING_STYLE_LABELS: Record<string, string> = {
  archery: 'Archery (+2 to ranged attack rolls)',
  defense: 'Defense (+1 AC while wearing armor)',
  great_weapon: 'Great Weapon Fighting (reroll 1s and 2s on two-handed melee damage)',
  two_weapon: 'Two-Weapon Fighting (add your ability modifier to off-hand damage)',
};

/**
 * How many Fighting Style feats this character is entitled to, summed
 * across the granting classes (each pick must be a distinct style):
 * Fighter L1 (+1 again at L7), Paladin L2, Ranger L2.
 */
export function fightingStyleSlots(char: Character): number {
  let slots = 0;
  const fighter = getClassLevel(char, 'fighter');
  if (fighter >= 1) slots += 1;
  if (fighter >= 7) slots += 1; // Additional Fighting Style
  if (getClassLevel(char, 'paladin') >= 2) slots += 1;
  if (getClassLevel(char, 'ranger') >= 2) slots += 1;
  return slots;
}

export function hasFightingStyle(char: Character, style: FightingStyleId): boolean {
  return (char.fighting_styles ?? []).includes(style);
}

/**
 * Defense Fighting Style AC bonus: +1 while wearing body armor (Light /
 * Medium / Heavy), else 0. Applied as a post-step at each
 * `char.ac = computeTotalAc(...)` site (kept out of computeTotalAc to
 * avoid threading a flag through its many call sites).
 */
export function defenseAcBonus(
  char: Pick<Character, 'fighting_styles' | 'equipped_armor' | 'inventory'>,
  lootTable: LootItem[]
): number {
  if (!(char.fighting_styles ?? []).includes('defense')) return 0;
  if (!char.equipped_armor) return 0;
  const armorItemId = char.inventory?.find((i) => i.instance_id === char.equipped_armor)?.id;
  const armor = armorItemId ? lootTable.find((l) => l.id === armorItemId) : undefined;
  // Body armor sets `armorAcBase`; shields / unarmored don't.
  return armor?.armorAcBase !== undefined ? 1 : 0;
}
