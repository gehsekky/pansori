import type { AbilityKey, Character, LootItem, WornEffect } from '../types.js';
import { abilityMod } from './rulesEngine.js';

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

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

/**
 * Total flat bonus to saving throws of `ability` from worn gear. Counts both
 * ability-specific bonuses (e.g. Moonstone Amulet +1 WIS) and all-saves bonuses
 * (`ability: 'all'` — Cloak / Ring of Protection's +1 to every save).
 */
export function wornSaveBonus(char: Character, ability: AbilityKey, lootTable: LootItem[]): number {
  return activeWornEffects(char, lootTable).reduce(
    (sum, e) =>
      e.kind === 'save_bonus' && (e.ability === ability || e.ability === 'all')
        ? sum + e.bonus
        : sum,
    0
  );
}

/**
 * Total flat AC bonus from worn gear (Cloak / Ring of Protection's +1). Folded
 * into the stored `ac` at every AC-recompute site, alongside `defenseAcBonus`,
 * so it stacks with armor and a shield.
 */
export function wornAcBonus(char: Character, lootTable: LootItem[]): number {
  return activeWornEffects(char, lootTable).reduce(
    (sum, e) => (e.kind === 'ac_bonus' ? sum + e.bonus : sum),
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

/**
 * Re-derive the EFFECTIVE ability scores from worn `set_ability` items (Amulet
 * of Health, Gauntlets of Ogre Power, Belt of Giant Strength, …). Mutates `char`
 * in place and is IDEMPOTENT — safe to call after any equip / unequip / attune /
 * ASI, and defensively at combat start.
 *
 * The contract: `char.str`/`con`/… always hold the EFFECTIVE score (so every
 * read site sees the boost with no change), while `char.ability_set_base` records
 * the TRUE base of any ability a worn item is currently raising, so removal
 * restores it. An item SETS the score to its `value` with no effect if the base
 * is already ≥ value (RAW); the highest worn value for an ability wins. A CON
 * change adjusts max HP by Δmod × level, mirroring the ASI rule.
 */
export function syncSetAbilities(char: Character, lootTable: LootItem[]): void {
  const oldConMod = abilityMod(char.con);
  // 1. Un-apply current overrides so every `char.<ability>` holds the true base.
  const prevBase = char.ability_set_base ?? {};
  for (const ab of ABILITIES) {
    const base = prevBase[ab];
    if (base !== undefined) char[ab] = base;
  }
  // 2. The score each worn `set_ability` effect wants (highest value per ability).
  const want: Partial<Record<AbilityKey, number>> = {};
  for (const e of activeWornEffects(char, lootTable)) {
    if (e.kind !== 'set_ability') continue;
    want[e.ability] = Math.max(want[e.ability] ?? 0, e.value);
  }
  // 3. Apply — set the effective score where the item beats the base; stash the
  //    displaced base. "No effect if base already ≥ value" falls out of the >.
  const nextBase: Partial<Record<AbilityKey, number>> = {};
  for (const ab of ABILITIES) {
    const target = want[ab];
    if (target !== undefined && target > char[ab]) {
      nextBase[ab] = char[ab];
      char[ab] = target;
    }
  }
  // Set to undefined (not `delete`) so a patch-merge persist (updatePcActor does
  // `{...char, ...patch}`) actually clears a previously-stored base map.
  char.ability_set_base = Object.keys(nextBase).length > 0 ? nextBase : undefined;
  // 4. A CON change ripples into max HP (Δmod × level), mirroring handleApplyAsi.
  const conDelta = (abilityMod(char.con) - oldConMod) * char.level;
  if (conDelta !== 0) {
    char.max_hp = Math.max(1, char.max_hp + conDelta);
    char.hp = Math.max(0, Math.min(char.max_hp, char.hp + conDelta));
  }
}
