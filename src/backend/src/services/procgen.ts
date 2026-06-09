import type { Context, Enemy, GameState, Seed } from '../types.js';
import { ENCOUNTER_ROOM_ID } from './mapEngine.js';
import { randomUUID } from 'crypto';
import { scaleRoomEnemiesByCount } from './enemyFactory.js';

/**
 * Build the run seed for a campaign context. (The roguelike procedural
 * generator was retired — the engine now runs only authored grid campaigns, so
 * the seed is the campaign's authored rooms/enemies/loot with the enemy COUNT
 * scaled to party size — the SRD way — relative to the campaign's
 * recommendedPartySize + the 3-level map definitions copied through for the FE.)
 */
export function generateSeed(context: Context, partySize = 1): Seed {
  const c = context.campaign;
  if (!c) {
    throw new Error(`generateSeed: context '${context.id}' has no campaign data`);
  }
  // Scale campaign enemy COUNT by party size (relative to the recommended size).
  // Stat blocks are left bestiary-exact — difficulty rides on numbers, per RAW.
  const recommendedSize = c.recommendedPartySize ?? 1;
  const scaledEnemies: Record<string, Enemy[]> = {};
  for (const [roomId, enemiesInRoom] of Object.entries(c.enemies ?? {})) {
    scaledEnemies[roomId] = scaleRoomEnemiesByCount(
      roomId,
      enemiesInRoom,
      partySize,
      recommendedSize
    );
  }
  return {
    context_id: context.id,
    world_name: c.world_name,
    ship_name: c.world_name,
    intro: c.intro,
    rooms: c.rooms,
    enemies: scaledEnemies,
    loot: c.loot ?? {},
    npcs: c.npcs ?? {},
    seed_id: randomUUID(),
    regions: c.regions,
    towns: c.towns,
    terrain_art: context.terrainArt,
    theme: context.theme,
    // Campaign-wide default combat grid size — the FE's fallback for rooms that
    // carry no size (matches combatGridDims, which reads context.gridWidth).
    gridWidth: context.gridWidth,
    gridHeight: context.gridHeight,
  };
}

/**
 * Re-resolve a running session's seed against the live campaign context so
 * campaign edits show up when the session is refreshed.
 *
 * A session's seed is a snapshot of the campaign taken at creation — and during
 * play the engine MUTATES `seed.enemies` in place (live combat HP, boss phases),
 * so it can't simply be replaced. This merge:
 *   - takes the presentation + structure + map + NPC definitions FRESH
 *     (world/intro/theme/terrain art, regions/towns, room text & layout, NPC
 *     dialogue) — these carry no per-session runtime state, so an edit is safe
 *     to surface everywhere, including the room the party is standing in;
 *   - preserves per-room enemy/loot PLACEMENTS for rooms the party has already
 *     entered (`visited_rooms`) — their live combat HP and cleared/looted state
 *     lives in the seed/state and must not reset or resurrect. (The engine
 *     blocks travelling on while a hostile is alive, so a visited room is either
 *     the current room or already cleared — locking it is always correct.)
 *   - takes enemy/loot placements FRESH for rooms not yet reached, so edits to
 *     upcoming encounters appear.
 *
 * Identity (`context_id`, `seed_id`) is carried over. Returns a new seed; inputs
 * are not mutated. Caller should skip when the context has no campaign data.
 */
export function reconcileSeedWithContext(existing: Seed, context: Context, state: GameState): Seed {
  if (!context.campaign) return existing;
  const partySize = state.characters?.length ?? 1;
  const fresh = generateSeed(context, partySize);
  const visited = new Set(state.visited_rooms ?? []);
  // A room whose placements must be kept as-is: one the party has entered, OR the
  // transient wilderness-encounter room (its rolled enemies + borrowed arena are
  // pure run state — never in the authored campaign, so `fresh` has no version).
  const preserve = (roomId: string) => visited.has(roomId) || roomId === ENCOUNTER_ROOM_ID;

  // For a preserved room keep the existing placements verbatim (incl. "none" — a
  // room the party passed through doesn't gain new spawns); for an unreached
  // room take the fresh placements (the author's edits to that encounter).
  const mergePlacements = <T>(
    freshMap: Record<string, T>,
    existingMap: Record<string, T>
  ): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const roomId of new Set([...Object.keys(freshMap), ...Object.keys(existingMap)])) {
      if (preserve(roomId)) {
        if (existingMap[roomId] !== undefined) out[roomId] = existingMap[roomId];
      } else if (freshMap[roomId] !== undefined) {
        out[roomId] = freshMap[roomId];
      }
    }
    return out;
  };

  // Carry over the transient encounter room (an in-progress wilderness fight) —
  // it isn't an authored room, so the fresh rooms don't include it.
  const rooms = [...fresh.rooms];
  const encounterRoom = (existing.rooms ?? []).find((r) => r.id === ENCOUNTER_ROOM_ID);
  if (encounterRoom) rooms.push(encounterRoom);

  return {
    ...fresh,
    rooms,
    context_id: existing.context_id,
    seed_id: existing.seed_id,
    enemies: mergePlacements(fresh.enemies, existing.enemies ?? {}),
    loot: mergePlacements(fresh.loot, existing.loot ?? {}),
  };
}
