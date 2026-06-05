import type { GameState, PlacedLoot, Seed } from '../types.js';

/**
 * The placed loot for a room, normalized to a list with stable keys.
 *
 * `Seed.loot[roomId]` is authored as a `PlacedLoot[]`, but legacy seed snapshots
 * (map data is snapshotted per save) may still hold a single `LootItem`. This
 * coerces either shape to an array and assigns a derived `key` (`${roomId}#${i}`)
 * to any item that lacks one, so the rest of the engine can gate per-placement.
 */
export function placedLootIn(seed: Seed, roomId: string): PlacedLoot[] {
  const raw = seed.loot?.[roomId] as PlacedLoot[] | PlacedLoot | undefined;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((item, i) => (item.key ? item : { ...item, key: `${roomId}#${i}` }));
}

/**
 * Whether a placed item has already been taken. Gates on the item's stable
 * `key`, which `handleLoot` pushes into `loot_taken`. Falls back to the legacy
 * room-level gate (old saves pushed the bare `roomId` when a room's single item
 * was taken) for the normalized first slot, so pre-feature saves don't resurface
 * an already-looted item.
 */
export function isLootTaken(st: GameState, roomId: string, item: PlacedLoot): boolean {
  const taken = st.loot_taken ?? [];
  if (item.key && taken.includes(item.key)) return true;
  if (item.key === `${roomId}#0` && taken.includes(roomId)) return true;
  return false;
}

/** The not-yet-taken placed loot for a room. */
export function availableLootIn(st: GameState, seed: Seed, roomId: string): PlacedLoot[] {
  return placedLootIn(seed, roomId).filter((item) => !isLootTaken(st, roomId, item));
}
