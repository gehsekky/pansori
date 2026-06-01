// FE port of the backend `mapEngine.activeGrid` (src/backend/src/services/
// mapEngine.ts). The frontend only receives the seed (not the campaign), so it
// resolves the grid the party marker is currently on from the seed's region /
// town / room definitions + the current map state. Kept in lockstep with the
// backend resolver (which is the source of truth for navigation); this mirror
// exists only so the FE can render without an extra round-trip — the same
// pattern as the chebyshev / cellsOnLine mirrors in GridCombatView.

import type { ActiveGrid, GameState, GridPos, MapTransition, Seed, TerrainCell } from '../types';
import { TERRAIN } from '../types';

const DEFAULT_LOCAL_GRID = 10;
const DEFAULT_LOCAL_SCALE = 5;

// Impassable terrain cells folded into the obstacle set (+ any legacy obstacles)
// — mirrors backend mapEngine.mergeObstacles so the FE marks the same cells
// unreachable as the server will.
function mergeObstacles(
  legacy: GridPos[] | undefined,
  terrain: TerrainCell[] | undefined
): GridPos[] {
  const impassable = (terrain ?? []).filter((c) => !TERRAIN[c.type].passable).map((c) => c.pos);
  return [...(legacy ?? []), ...impassable];
}

type SeedRoom = Seed['rooms'][number];

function roomGrid(room: SeedRoom): {
  width: number;
  height: number;
  scale: number;
  entry: { x: number; y: number };
} {
  const width = room.gridWidth ?? DEFAULT_LOCAL_GRID;
  const height = room.gridHeight ?? DEFAULT_LOCAL_GRID;
  return {
    width,
    height,
    scale: room.feetPerSquare ?? DEFAULT_LOCAL_SCALE,
    entry: room.entryPos ?? { x: Math.floor(width / 2), y: Math.floor(height / 2) },
  };
}

/**
 * Resolve the grid the party marker is on from the seed + state. Returns null
 * when the campaign isn't on the 3-level map model (no regions/towns) or the
 * referenced grid can't be found (e.g. a transient encounter room).
 */
export function activeGrid(seed: Seed | undefined, st: GameState): ActiveGrid | null {
  if (!seed) return null;
  const level = st.map_level;

  if (level === 'regional') {
    const region = seed.regions?.find((r) => r.id === st.current_region_id);
    if (!region) return null;
    return {
      level,
      id: region.id,
      name: region.name,
      width: region.gridWidth,
      height: region.gridHeight,
      feetPerSquare: region.feetPerSquare,
      terrain: region.terrain ?? [],
      obstacles: mergeObstacles(region.obstacles, region.terrain),
      startPos: region.startPos,
      transitions: region.sites.map((s) => ({
        pos: s.pos,
        kind: 'site' as const,
        label: s.name,
        toTownId: s.kind === 'town' ? s.townId : undefined,
        toRoomId: s.kind === 'local' ? s.entryRoomId : undefined,
      })),
    };
  }

  if (level === 'town') {
    const town = seed.towns?.find((t) => t.id === st.current_town_id);
    if (!town) return null;
    return {
      level,
      id: town.id,
      name: town.name,
      width: town.gridWidth,
      height: town.gridHeight,
      feetPerSquare: town.feetPerSquare,
      terrain: town.terrain ?? [],
      obstacles: mergeObstacles(town.obstacles, town.terrain),
      startPos: town.startPos,
      transitions: town.venues.map((v) => ({
        pos: v.pos,
        kind: v.kind === 'gate' ? ('ascend' as const) : ('venue' as const),
        label: v.name,
        toRoomId: v.kind === 'interior' ? v.entryRoomId : undefined,
        ascendTo: v.kind === 'gate' ? ('region' as const) : undefined,
      })),
    };
  }

  if (level === 'local') {
    const room = seed.rooms.find((r) => r.id === st.current_room);
    if (!room) return null;
    const g = roomGrid(room);
    const transitions: MapTransition[] = (room.exits ?? []).map((e) => ({
      pos: e.pos,
      kind: e.ascends ? ('ascend' as const) : ('room_exit' as const),
      label: e.label ?? (e.ascends ? 'Exit' : 'Passage'),
      toRoomId: e.toRoomId,
      entrancePos: e.entrancePos,
      ascendTo: e.ascends
        ? st.current_town_id
          ? ('town' as const)
          : ('region' as const)
        : undefined,
    }));
    return {
      level,
      id: room.id,
      name: room.name,
      width: g.width,
      height: g.height,
      feetPerSquare: g.scale,
      terrain: [],
      obstacles: room.obstacles ?? [],
      startPos: g.entry,
      transitions,
    };
  }

  return null;
}
