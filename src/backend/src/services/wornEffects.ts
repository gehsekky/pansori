import type { AbilityKey, Character, LootItem, WornEffect } from '../types.js';

// Worn-effects layer. An item confers its passive `wornEffects` only while it is
// WORN in a body slot (it's in `char.equipment`) AND — if it requires
// attunement — the character is attuned to it. Both gates matter: attuning to
// the Moonstone Amulet without putting it on, or wearing it without attuning,
// gives nothing, matching 5e's "worn and attuned" requirement.

/** All worn effects currently active on `char`, across every filled slot. */
export function activeWornEffects(char: Character, lootTable: LootItem[]): WornEffect[] {
  const attuned = char.attuned_items ?? [];
  const out: WornEffect[] = [];
  for (const instanceId of Object.values(char.equipment ?? {})) {
    const invItem = char.inventory?.find((i) => i.instance_id === instanceId);
    const loot = invItem ? lootTable.find((l) => l.id === invItem.id) : undefined;
    if (!loot?.wornEffects?.length) continue;
    if (loot.requiresAttunement && !attuned.includes(instanceId)) continue;
    out.push(...loot.wornEffects);
  }
  return out;
}

/** Total flat bonus to saving throws of `ability` from worn gear (e.g. +1 WIS). */
export function wornSaveBonus(char: Character, ability: AbilityKey, lootTable: LootItem[]): number {
  return activeWornEffects(char, lootTable).reduce(
    (sum, e) => (e.kind === 'save_bonus' && e.ability === ability ? sum + e.bonus : sum),
    0
  );
}

/**
 * Largest bright-light radius (ft) shed by the character's worn light sources
 * (e.g. a held Torch). 0 = no worn light. Synced onto the combat entity's
 * `light_radius_ft` at combat start so the bearer illuminates the dark.
 */
export function wornLightRadius(char: Character, lootTable: LootItem[]): number {
  return activeWornEffects(char, lootTable).reduce(
    (max, e) => (e.kind === 'light' ? Math.max(max, e.radiusFt) : max),
    0
  );
}
