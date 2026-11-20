import type { Character, LootItem } from '../types.js';
import { abilityMod, computeTotalAc } from './rulesEngine.js';
import { equippedArmorId, equippedShieldId } from './equipment.js';
import { defenseAcBonus } from './fightingStyle.js';
import { getClassLevel } from './multiclass.js';
import { wornAcBonus } from './wornEffects.js';

/** True when the character has body armor (Light / Medium / Heavy) equipped. */
export function wearingBodyArmor(
  char: Pick<Character, 'equipment' | 'inventory'>,
  lootTable: LootItem[]
): boolean {
  const iid = equippedArmorId(char);
  if (!iid) return false;
  const itemId = (char.inventory ?? []).find((i) => i.instance_id === iid)?.id;
  if (!itemId) return false;
  // With no loot-table entry the category can't be read; treat any equipped
  // armor-slot item as armor (the conservative reading for Unarmored features).
  const item = lootTable.find((l) => l.id === itemId);
  return item ? item.armorAcBase !== undefined : true;
}

/** True when a Shield is equipped. */
export function wieldingShield(char: Pick<Character, 'equipment'>): boolean {
  return !!equippedShieldId(char);
}

/**
 * The extra AC an unarmored base-AC feature gives over the plain 10 + DEX.
 *
 * SRD: Barbarian Unarmored Defense (10 + DEX + CON; a Shield is allowed), Monk
 * Unarmored Defense (10 + DEX + WIS; no armor and no Shield), Draconic Sorcery
 * Draconic Resilience (L3; 10 + DEX + CHA; no armor).
 * SRD: Multiclassing / Armor Class — with several ways to calculate AC you use
 * only one, so the best one applies. Mage Armor (13 + DEX) is another such
 * calculation, so only the excess over its +3 counts. Never negative: a
 * character with a negative modifier simply uses the normal calculation.
 */
export function unarmoredDefenseBonus(char: Character, lootTable: LootItem[]): number {
  if (wearingBodyArmor(char, lootTable)) return 0;
  const options: number[] = [];
  if (getClassLevel(char, 'barbarian') >= 1) options.push(abilityMod(char.con));
  if (getClassLevel(char, 'monk') >= 1 && !wieldingShield(char)) {
    options.push(abilityMod(char.wis));
  }
  if (char.subclass === 'draconic' && getClassLevel(char, 'sorcerer') >= 3) {
    options.push(abilityMod(char.cha));
  }
  // SRD Robe of the Archmagi — base AC 15 + DEX without armor.
  const robeBase = char.worn_traits?.unarmoredBaseAc;
  if (robeBase) options.push(robeBase - 10);
  if (options.length === 0) return 0;
  const best = Math.max(...options);
  return Math.max(0, best - (char.mage_armor_active ? 3 : 0));
}

/**
 * The character's full Armor Class, from scratch: armor / shield / DEX,
 * unarmored-defense features, the persistent buff flags (Mage Armor, Shield of
 * Faith, Haste, Barkskin), the Defense Fighting Style, worn-gear bonuses
 * (Cloak / Ring of Protection) and an active Shield spell (+5 until its
 * condition ticks off, which subtracts it again).
 *
 * Every site that rewrites the stored `ac` goes through here so the parts
 * can't drift apart.
 */
export function characterAc(char: Character, lootTable: LootItem[]): number {
  const conditions = char.conditions ?? [];
  let ac =
    computeTotalAc(
      char.dex,
      equippedArmorId(char),
      equippedShieldId(char),
      char.inventory ?? [],
      lootTable,
      char.mage_armor_active ?? false,
      char.shield_of_faith_active ?? false,
      conditions.includes('hasted'),
      false
    ) + unarmoredDefenseBonus(char, lootTable);
  // SRD Barkskin — AC can't be less than 17 (floored before the flat gear
  // bonuses, matching the prior ordering).
  if (char.barkskin_active) ac = Math.max(ac, 17);
  ac += defenseAcBonus(char, lootTable) + wornAcBonus(char, lootTable);
  if (conditions.includes('shield_spell')) ac += 5;
  return ac;
}
