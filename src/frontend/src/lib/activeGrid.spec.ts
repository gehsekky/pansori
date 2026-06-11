import type { GameState, Seed } from '../types';
import { describe, expect, it } from 'vitest';
import { activeGrid } from './activeGrid';

// FE port of the backend mapEngine.activeGrid — must resolve the same grid the
// backend would for a given (seed, state). Mirrors the backend mapEngine.spec
// fixture so the two stay in lockstep.

const seed = {
  rooms: [
    {
      id: 'crypt',
      name: 'Crypt',
      desc: '',
      gridWidth: 10,
      gridHeight: 10,
      entryPos: { x: 0, y: 0 },
      exits: [
        { pos: { x: 9, y: 9 }, toRoomId: 'hall', entrancePos: { x: 0, y: 0 }, label: 'Stairs' },
        { pos: { x: 0, y: 1 }, ascends: true, label: 'Exit' },
      ],
    },
  ],
  regions: [
    {
      id: 'reg1',
      name: 'The Vale',
      feetPerSquare: 5280,
      gridWidth: 12,
      gridHeight: 12,
      startPos: { x: 0, y: 0 },
      obstacles: [{ x: 5, y: 5 }],
      sites: [
        { id: 's_town', name: 'Millhaven', pos: { x: 2, y: 0 }, kind: 'town', townId: 'town1' },
        { id: 's_crypt', name: 'Crypt', pos: { x: 5, y: 0 }, kind: 'local', entryRoomId: 'crypt' },
      ],
    },
  ],
  towns: [
    {
      id: 'town1',
      name: 'Millhaven',
      feetPerSquare: 25,
      gridWidth: 8,
      gridHeight: 8,
      startPos: { x: 0, y: 0 },
      venues: [
        {
          id: 'v_inn',
          name: 'The Inn',
          pos: { x: 3, y: 3 },
          kind: 'interior',
          entryRoomId: 'crypt',
        },
        { id: 'v_gate', name: 'Gate', pos: { x: 1, y: 1 }, kind: 'gate' },
      ],
    },
  ],
} as unknown as Seed;

const at = (st: Partial<GameState>) => activeGrid(seed, st as GameState);

describe('activeGrid (FE port)', () => {
  it('resolves the regional grid with scale + sites + obstacles', () => {
    const g = at({ map_level: 'regional', current_region_id: 'reg1' })!;
    expect(g.level).toBe('regional');
    expect(g.feetPerSquare).toBe(5280);
    expect(g.width).toBe(12);
    expect(g.obstacles).toEqual([{ x: 5, y: 5 }]);
    expect(g.transitions).toHaveLength(2);
    expect(g.transitions.find((t) => t.toTownId === 'town1')).toBeTruthy();
    expect(g.transitions.find((t) => t.toRoomId === 'crypt')).toBeTruthy();
  });

  it('resolves the town grid; a gate venue becomes an ascend transition', () => {
    const g = at({ map_level: 'town', current_town_id: 'town1' })!;
    expect(g.level).toBe('town');
    expect(g.feetPerSquare).toBe(25);
    const gate = g.transitions.find((t) => t.kind === 'ascend');
    expect(gate?.ascendTo).toBe('region');
    expect(g.transitions.find((t) => t.kind === 'venue')?.toRoomId).toBe('crypt');
  });

  it('resolves a local room; exits become room_exit / ascend transitions', () => {
    const g = at({ map_level: 'local', current_room: 'crypt' })!;
    expect(g.level).toBe('local');
    expect(g.feetPerSquare).toBe(5);
    expect(g.startPos).toEqual({ x: 0, y: 0 });
    expect(g.transitions.find((t) => t.kind === 'room_exit')?.toRoomId).toBe('hall');
    expect(g.transitions.find((t) => t.kind === 'ascend')?.ascendTo).toBe('region');
    // Floor texture defaults to cobblestone when the room doesn't author one.
    expect(g.floor).toBe('cobblestone');
  });

  it('carries an authored room floor through to the grid', () => {
    const dirtSeed = {
      ...seed,
      rooms: [{ ...seed.rooms[0], floor: 'dirt' }],
    } as unknown as Seed;
    const g = activeGrid(dirtSeed, { map_level: 'local', current_room: 'crypt' } as GameState)!;
    expect(g.floor).toBe('dirt');
  });

  it('an in-town local room ascends to the town, not the region', () => {
    const g = at({ map_level: 'local', current_room: 'crypt', current_town_id: 'town1' })!;
    expect(g.transitions.find((t) => t.kind === 'ascend')?.ascendTo).toBe('town');
  });

  it('folds impassable terrain into obstacles and carries the terrain array', () => {
    const terrainSeed = {
      ...seed,
      regions: [
        {
          ...(seed.regions as NonNullable<Seed['regions']>)[0],
          terrain: [
            { pos: { x: 1, y: 1 }, type: 'mountain' },
            { pos: { x: 2, y: 2 }, type: 'road' },
          ],
        },
      ],
    } as unknown as Seed;
    const g = activeGrid(terrainSeed, {
      map_level: 'regional',
      current_region_id: 'reg1',
    } as GameState)!;
    expect(g.terrain).toHaveLength(2);
    expect(g.obstacles).toContainEqual({ x: 5, y: 5 }); // legacy obstacle preserved
    expect(g.obstacles).toContainEqual({ x: 1, y: 1 }); // mountain folded in
    expect(g.obstacles).not.toContainEqual({ x: 2, y: 2 }); // road stays passable
  });

  it('treats an unknown terrain type as passable instead of crashing', () => {
    const badSeed = {
      ...seed,
      regions: [
        {
          ...(seed.regions as NonNullable<Seed['regions']>)[0],
          // 'mud' is not a TerrainType — TERRAIN['mud'] is undefined. The render
          // must not throw on the `.passable` lookup.
          terrain: [{ pos: { x: 1, y: 1 }, type: 'mud' }],
        },
      ],
    } as unknown as Seed;
    const g = activeGrid(badSeed, {
      map_level: 'regional',
      current_region_id: 'reg1',
    } as GameState)!;
    expect(g).not.toBeNull();
    expect(g.obstacles).not.toContainEqual({ x: 1, y: 1 }); // unknown → passable, not folded in
  });

  it('returns null off the map model or for an unknown / transient room', () => {
    expect(activeGrid(seed, {} as GameState)).toBeNull();
    expect(at({ map_level: 'regional', current_region_id: 'nope' })).toBeNull();
    expect(at({ map_level: 'local', current_room: '__encounter__' })).toBeNull();
    expect(activeGrid(undefined, { map_level: 'regional' } as GameState)).toBeNull();
  });
});
