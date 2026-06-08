import type { Context, Enemy, Seed } from '../types.js';
import { randomUUID } from 'crypto';
import { scaleEnemyHp } from './enemyFactory.js';

/**
 * Build the run seed for a campaign context. (The roguelike procedural
 * generator was retired — the engine now runs only authored grid campaigns, so
 * the seed is the campaign's authored rooms/enemies/loot with enemy HP scaled
 * to party size + the 3-level map definitions copied through for the frontend.)
 */
export function generateSeed(context: Context, partySize = 1): Seed {
  const c = context.campaign;
  if (!c) {
    throw new Error(`generateSeed: context '${context.id}' has no campaign data`);
  }
  // Scale campaign enemy HP by party size.
  const scaledEnemies: Record<string, Enemy[]> = {};
  for (const [roomId, enemiesInRoom] of Object.entries(c.enemies ?? {})) {
    scaledEnemies[roomId] = enemiesInRoom.map((enemy) => {
      const scaled = scaleEnemyHp(enemy.hp, partySize);
      return { ...enemy, hp: scaled, maxHp: scaled };
    });
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
  };
}
