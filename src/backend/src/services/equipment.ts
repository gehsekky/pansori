import type { Character, EquipSlot, ItemSlot } from '../types.js';

// Accessors for a character's body-slot equipment map. The map holds, per
// filled slot, the inventory instance_id of the worn/wielded item. These
// helpers keep call sites slot-name-agnostic and shield the rest of the engine
// from the map's shape (and from `undefined` vs `null`).

export type Equipment = Partial<Record<EquipSlot, string>>;

// Accessors take the minimal `{ equipment }` shape (not full Character) so they
// work with the Pick<> projections some helpers pass around.
type HasEquipment = Pick<Character, 'equipment'>;

/** instance_id worn in `slot`, or null if the slot is empty. */
export function equippedId(char: HasEquipment, slot: EquipSlot): string | null {
  return char.equipment?.[slot] ?? null;
}

// The three legacy slots, named for the common call sites that used to read
// equipped_weapon / equipped_armor / equipped_shield directly.
export const equippedWeaponId = (char: HasEquipment): string | null =>
  equippedId(char, 'main_hand');
export const equippedArmorId = (char: HasEquipment): string | null => equippedId(char, 'armor');
export const equippedShieldId = (char: HasEquipment): string | null => equippedId(char, 'shield');

/**
 * Return a NEW equipment map with `slot` set to `instanceId` (or cleared when
 * `instanceId` is null/undefined). Pure — never mutates the input.
 */
export function setSlot(eq: Equipment, slot: EquipSlot, instanceId: string | null): Equipment {
  const next: Equipment = { ...eq };
  if (instanceId) next[slot] = instanceId;
  else delete next[slot];
  return next;
}

/**
 * Return a NEW equipment map with `instanceId` removed from whatever slot(s) it
 * occupies. Used when an item leaves the inventory (sold, dropped, consumed) so
 * it can't linger as "equipped".
 */
export function clearInstance(eq: Equipment, instanceId: string): Equipment {
  const next: Equipment = { ...eq };
  for (const slot of Object.keys(next) as EquipSlot[]) {
    if (next[slot] === instanceId) delete next[slot];
  }
  return next;
}

/** Slots `instanceId` currently occupies (usually 0 or 1). */
export function slotsForInstance(eq: Equipment, instanceId: string): EquipSlot[] {
  return (Object.keys(eq) as EquipSlot[]).filter((slot) => eq[slot] === instanceId);
}

/**
 * All EquipSlots an item with category `itemSlot` could occupy. 'weapon' →
 * main_hand; 'ring' → both ring slots (caller picks the first free one); every
 * other category maps 1:1 to the EquipSlot of the same name.
 */
export function candidateSlots(itemSlot: ItemSlot): EquipSlot[] {
  if (itemSlot === 'weapon') return ['main_hand'];
  if (itemSlot === 'ring') return ['ring_1', 'ring_2'];
  return [itemSlot];
}

/**
 * Toggle a worn item in/out of its body slot. If `instanceId` is already worn
 * in one of the item's candidate slots, take it off; otherwise place it in the
 * first free candidate slot. Returns the updated map, or `{ full: true }` when
 * every candidate slot is occupied by something else (e.g. both rings worn).
 */
export function toggleWornItem(
  eq: Equipment,
  itemSlot: ItemSlot,
  instanceId: string
): { equipment: Equipment } | { full: true } {
  const cands = candidateSlots(itemSlot);
  const wornSlot = cands.find((s) => eq[s] === instanceId);
  if (wornSlot) return { equipment: setSlot(eq, wornSlot, null) };
  const free = cands.find((s) => !eq[s]);
  if (!free) return { full: true };
  return { equipment: setSlot(eq, free, instanceId) };
}

/**
 * Build an equipment map from the legacy equipped_weapon/armor/shield fields on
 * a raw (pre-migration) saved character. Used by normalizeState so old sessions
 * load into the new shape.
 */
export function equipmentFromLegacy(raw: {
  equipped_weapon?: string | null;
  equipped_armor?: string | null;
  equipped_shield?: string | null;
  equipment?: Equipment;
}): Equipment {
  if (raw.equipment) return raw.equipment;
  const eq: Equipment = {};
  if (raw.equipped_weapon) eq.main_hand = raw.equipped_weapon;
  if (raw.equipped_armor) eq.armor = raw.equipped_armor;
  if (raw.equipped_shield) eq.shield = raw.equipped_shield;
  return eq;
}
