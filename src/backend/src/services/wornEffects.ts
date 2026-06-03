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
  return activeWornEffects(char, lootTable)
    .filter((e) => e.kind === 'save_bonus' && e.ability === ability)
    .reduce((sum, e) => sum + e.bonus, 0);
}
