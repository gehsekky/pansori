// Encounter-zone arena rooms: a zone may map a triggering square's terrain type
// to a list of room ids; a random encounter there is fought on a random one of
// those rooms' layouts (else the default bare arena).

import type { CampaignData, CampaignRegion, GameState, Room, Seed } from '../../types.js';
import {
  ENCOUNTER_ROOM_ID,
  applyEncounterArena,
  resolveMarkerMove,
} from '../../services/mapEngine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbRegionsToEngine } from '../../services/campaignContent.js';

afterEach(() => vi.restoreAllMocks());

// A one-step regional hop whose destination square (forest) is painted into an
// encounter zone. encounterChance 1 × forest mult (2.5) with Math.random()→0
// guarantees the roll fires and index 0 is picked.
function regionWith(arenaRooms: Record<string, string[]> | undefined) {
  return {
    id: 'reg',
    name: 'Wilds',
    feetPerSquare: 5280,
    gridWidth: 3,
    gridHeight: 1,
    startPos: { x: 0, y: 0 },
    terrain: [{ pos: { x: 1, y: 0 }, type: 'forest' }],
    encounterZones: [
      {
        id: 'z',
        tier: 1,
        encounterChance: 1,
        encounterTable: ['Goblin Warrior'],
        cells: [{ x: 1, y: 0 }],
        ...(arenaRooms ? { arenaRooms } : {}),
      },
    ],
    sites: [],
  };
}
function campaignWith(arenaRooms: Record<string, string[]> | undefined): CampaignData {
  return {
    world_name: 'T',
    intro: '',
    rooms: [],
    regions: [regionWith(arenaRooms)],
  } as unknown as CampaignData;
}
function start(): GameState {
  return {
    map_level: 'regional',
    current_region_id: 'reg',
    marker_pos: { x: 0, y: 0 },
    visited_rooms: [],
  } as unknown as GameState;
}

describe('resolveMarkerMove — encounter arena selection', () => {
  it('picks an arena room for the triggering square’s terrain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = resolveMarkerMove(campaignWith({ forest: ['forest_clearing'] }), [], start(), {
      x: 1,
      y: 0,
    });
    expect(r.encounter).toBe('Goblin Warrior');
    expect(r.encounterArenaRoomId).toBe('forest_clearing');
  });

  it('falls back to the default arena when the terrain has no entry', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = resolveMarkerMove(campaignWith({ hills: ['hill_fort'] }), [], start(), {
      x: 1,
      y: 0,
    });
    expect(r.encounter).toBe('Goblin Warrior');
    expect(r.encounterArenaRoomId).toBeUndefined();
  });

  it('falls back when the terrain entry is an empty array', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = resolveMarkerMove(campaignWith({ forest: [] }), [], start(), { x: 1, y: 0 });
    expect(r.encounterArenaRoomId).toBeUndefined();
  });

  it('falls back when the zone defines no arenaRooms at all', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = resolveMarkerMove(campaignWith(undefined), [], start(), { x: 1, y: 0 });
    expect(r.encounter).toBe('Goblin Warrior');
    expect(r.encounterArenaRoomId).toBeUndefined();
  });
});

describe('applyEncounterArena', () => {
  const arenaRoom: Room = {
    id: 'forest_clearing',
    name: 'Forest Clearing',
    desc: 'A ring of old pines.',
    floor: 'grass',
    lighting: 'dim',
    obstacles: [{ x: 2, y: 2 }],
    difficultTerrain: [{ x: 3, y: 3 }],
    exits: [{ pos: { x: 0, y: 0 }, ascends: true }],
  };
  const seedWith = (): Seed => ({ rooms: [arenaRoom], enemies: {}, loot: {} }) as unknown as Seed;

  it('borrows the room’s battleground layout (not its content) into __encounter__', () => {
    const seed = seedWith();
    applyEncounterArena(seed, 'forest_clearing');
    const enc = seed.rooms.find((r) => r.id === ENCOUNTER_ROOM_ID);
    expect(enc).toBeTruthy();
    expect(enc!.floor).toBe('grass');
    expect(enc!.lighting).toBe('dim');
    expect(enc!.obstacles).toEqual([{ x: 2, y: 2 }]);
    expect(enc!.difficultTerrain).toEqual([{ x: 3, y: 3 }]);
    // Content (exits/objects/etc.) is NOT borrowed — it's a battleground only.
    expect(enc!.exits).toBeUndefined();
  });

  it('clears any prior arena when passed undefined', () => {
    const seed = seedWith();
    applyEncounterArena(seed, 'forest_clearing');
    applyEncounterArena(seed, undefined);
    expect(seed.rooms.find((r) => r.id === ENCOUNTER_ROOM_ID)).toBeUndefined();
  });

  it('uses the default arena (no synthetic room) for an unknown room id', () => {
    const seed = seedWith();
    applyEncounterArena(seed, 'nonexistent');
    expect(seed.rooms.find((r) => r.id === ENCOUNTER_ROOM_ID)).toBeUndefined();
  });
});

describe('dbRegionsToEngine — arenaRooms carry through', () => {
  it('preserves a zone’s arenaRooms map into the engine region', () => {
    const region: CampaignRegion = {
      id: 'reg',
      name: 'Wilds',
      isStartingRegion: true,
      feetPerSquare: 5280,
      grid: [[{ t: 'forest', ez: 'z' }]],
      startPos: { x: 0, y: 0 },
      encounterZones: [
        {
          id: 'z',
          name: 'Deep Wood',
          tier: 1,
          encounterChance: 0.2,
          encounterTable: ['Goblin Warrior'],
          arenaRooms: { forest: ['forest_clearing', 'fern_hollow'] },
        },
      ],
    };
    const [engineRegion] = dbRegionsToEngine([region]);
    expect(engineRegion.encounterZones?.[0]?.arenaRooms).toEqual({
      forest: ['forest_clearing', 'fern_hollow'],
    });
  });
});
