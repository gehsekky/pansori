import type { GameState, Seed } from '../types';
import type { PlacedLoot } from '../shared-types';

// Frontend mirror of the backend `placedLoot` helper (the FE can't import
// backend modules). Normalizes `seed.loot[roomId]` — which is authored as a
// `PlacedLoot[]` but may be a single legacy `LootItem` in old snapshots — into a
// keyed list, then filters out items already taken. Drives the loot map tokens.

export function placedLootIn(seed: Seed, roomId: string): PlacedLoot[] {
  const raw = seed.loot?.[roomId] as PlacedLoot[] | PlacedLoot | undefined;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((item, i) => (item.key ? item : { ...item, key: `${roomId}#${i}` }));
}

export function isLootTaken(state: GameState, roomId: string, item: PlacedLoot): boolean {
  const taken = state.loot_taken ?? [];
  if (item.key && taken.includes(item.key)) return true;
  // Legacy saves recorded the bare roomId when a room's single item was taken.
  if (item.key === `${roomId}#0` && taken.includes(roomId)) return true;
  return false;
}

export function availableLootIn(state: GameState, seed: Seed, roomId: string): PlacedLoot[] {
  return placedLootIn(seed, roomId).filter((item) => !isLootTaken(state, roomId, item));
}
