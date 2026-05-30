// 3-level grid map model (regional → town → local). Every level is a tile grid
// with a `feetPerSquare` scale (SRD: regional 5280 / town 25 / local 5). The
// party is a single marker (`GameState.marker_pos`); `resolveMarkerMove` walks it
// (free pathfinding out of combat) and, when it arrives on a transition cell,
// descends/ascends/changes rooms. This is the campaign navigation system that
// replaces Location/District `travel` + the room `connections` graph.

import type { CampaignData, GameState, GridPos, MapLevel, Region, Room, Town } from '../types.js';
import { findPath, posEqual } from './gridEngine.js';

const DEFAULT_LOCAL_GRID = 10;
const DEFAULT_LOCAL_SCALE = 5;
const FEET_PER_MILE = 5280;
const NORMAL_MILES_PER_HOUR = 3; // SRD Travel Pace — Normal (3 mi/hr, 24 mi/day)

/**
 * Place the party on the regional grid at campaign start. No-op unless the
 * campaign uses the new map model (`regions`) and map state isn't already set.
 */
export function initMapState(campaign: CampaignData | undefined, st: GameState): GameState {
  const region = campaign?.regions?.[0];
  if (!region || st.map_level) return st;
  return {
    ...st,
    map_level: 'regional',
    current_region_id: region.id,
    marker_pos: region.startPos,
  };
}

// A transition cell on the active grid — where stepping onto it does something.
export interface MapTransition {
  pos: GridPos;
  kind: 'site' | 'venue' | 'room_exit' | 'ascend';
  label: string;
  // resolution payloads (by kind)
  toTownId?: string; // site → town
  toRoomId?: string; // site/venue → local room, or room_exit → next room
  entrancePos?: GridPos; // arrival cell in the destination room
  ascendTo?: 'town' | 'region'; // ascend / gate
}

// The grid the party marker is currently on, normalized for movement + render.
export interface ActiveGrid {
  level: MapLevel;
  id: string;
  name: string;
  width: number;
  height: number;
  feetPerSquare: number;
  obstacles: GridPos[];
  transitions: MapTransition[];
  startPos: GridPos;
}

export function regionById(campaign: CampaignData | undefined, id?: string): Region | undefined {
  return campaign?.regions?.find((r) => r.id === id);
}
export function townById(campaign: CampaignData | undefined, id?: string): Town | undefined {
  return campaign?.towns?.find((t) => t.id === id);
}
function roomById(rooms: Room[], id?: string): Room | undefined {
  return rooms.find((r) => r.id === id);
}

function roomGrid(room: Room): { width: number; height: number; scale: number; entry: GridPos } {
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
 * Resolve the grid the party marker is on, given the campaign + current state.
 * Returns null when the campaign isn't on the new map model (no regions/towns)
 * or the referenced map can't be found.
 */
export function activeGrid(
  campaign: CampaignData | undefined,
  rooms: Room[],
  st: GameState
): ActiveGrid | null {
  if (!campaign) return null;
  const level = st.map_level;
  if (level === 'regional') {
    const region = regionById(campaign, st.current_region_id);
    if (!region) return null;
    return {
      level,
      id: region.id,
      name: region.name,
      width: region.gridWidth,
      height: region.gridHeight,
      feetPerSquare: region.feetPerSquare,
      obstacles: region.obstacles ?? [],
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
    const town = townById(campaign, st.current_town_id);
    if (!town) return null;
    return {
      level,
      id: town.id,
      name: town.name,
      width: town.gridWidth,
      height: town.gridHeight,
      feetPerSquare: town.feetPerSquare,
      obstacles: town.obstacles ?? [],
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
    const room = roomById(rooms, st.current_room);
    if (!room) return null;
    const g = roomGrid(room);
    return {
      level,
      id: room.id,
      name: room.name,
      width: g.width,
      height: g.height,
      feetPerSquare: g.scale,
      obstacles: room.obstacles ?? [],
      startPos: g.entry,
      transitions: (room.exits ?? []).map((e) => ({
        pos: e.pos,
        kind: e.ascends ? ('ascend' as const) : ('room_exit' as const),
        label: e.label ?? (e.ascends ? 'Exit' : 'Passage'),
        toRoomId: e.toRoomId,
        entrancePos: e.entrancePos,
        // Ascend from a local room: to the town if we're inside one, else region.
        ascendTo: e.ascends ? (st.current_town_id ? 'town' : 'region') : undefined,
      })),
    };
  }
  return null;
}

function transitionAt(grid: ActiveGrid, pos: GridPos): MapTransition | undefined {
  return grid.transitions.find((t) => posEqual(t.pos, pos));
}

export interface MarkerMoveResult {
  st: GameState;
  narrative: string;
  /** Squares the marker crossed (for travel-time / encounter rolls). */
  squaresMoved: number;
  /** A transition was resolved at the destination (descend/ascend/room change). */
  transitioned: boolean;
  /** Travel time the move cost in hours (regional grid only). */
  elapsedHours: number;
  /** A random encounter triggered en route — the rolled enemy template name.
   *  The caller drops the party into a local encounter (combat). */
  encounter?: string;
  rejected?: string;
}

/**
 * Move the party marker to `to` on the current grid (free pathfinding — no combat
 * budget). If `to` is a transition cell, resolve it (descend a site/venue, change
 * room, or ascend). Returns the updated state + how far the marker travelled.
 */
export function resolveMarkerMove(
  campaign: CampaignData | undefined,
  rooms: Room[],
  st: GameState,
  to: GridPos
): MarkerMoveResult {
  const reject = (rejected: string): MarkerMoveResult => ({
    st,
    narrative: '',
    squaresMoved: 0,
    transitioned: false,
    elapsedHours: 0,
    rejected,
  });
  const grid = activeGrid(campaign, rooms, st);
  if (!grid) return reject('No map here.');
  const from = st.marker_pos ?? grid.startPos;
  if (posEqual(from, to)) return reject('Already there.');
  if (to.x < 0 || to.x >= grid.width || to.y < 0 || to.y >= grid.height)
    return reject('Off the map.');
  const path = findPath(from, to, grid.obstacles, grid.width, grid.height);
  if (!path || path.length === 0) return reject('No path there.');

  let next: GameState = { ...st, marker_pos: to };
  const squaresMoved = path.length;
  let narrative = '';

  // ── Regional travel: spend SRD travel time + roll a per-square encounter ────
  let elapsedHours = 0;
  let encounter: string | undefined;
  if (grid.level === 'regional') {
    const region = regionById(campaign, st.current_region_id);
    const milesPerSquare = grid.feetPerSquare / FEET_PER_MILE;
    elapsedHours = (squaresMoved * milesPerSquare) / NORMAL_MILES_PER_HOUR;
    next.world_hour = (st.world_hour ?? 0) + elapsedHours;
    const chance = region?.encounterChance ?? 0;
    const table = region?.encounterTable ?? [];
    if (chance > 0 && table.length > 0) {
      for (let i = 0; i < squaresMoved; i++) {
        if (Math.random() < chance) {
          encounter = table[Math.floor(Math.random() * table.length)];
          break;
        }
      }
    }
  }

  // ── Resolve a transition cell at the destination (descend/ascend/room) ──────
  const transition = encounter ? undefined : transitionAt(grid, to);
  let transitioned = false;
  if (transition) {
    const res = resolveTransition(campaign, rooms, next, transition);
    next = res.st;
    narrative = res.narrative;
    transitioned = true;
  }
  return { st: next, narrative, squaresMoved, transitioned, elapsedHours, encounter };
}

/** Apply a transition the marker stepped onto: descend / ascend / change room. */
export function resolveTransition(
  campaign: CampaignData | undefined,
  rooms: Room[],
  st: GameState,
  t: MapTransition
): { st: GameState; narrative: string } {
  // ── Descend into a town ──────────────────────────────────────────────
  if (t.kind === 'site' && t.toTownId) {
    const town = townById(campaign, t.toTownId);
    if (!town) return { st, narrative: '' };
    return {
      st: {
        ...st,
        map_level: 'town',
        current_town_id: town.id,
        marker_pos: town.startPos,
        region_marker_pos: st.marker_pos, // bookmark the region cell for ascent
      },
      narrative: ` You enter ${town.name}.`,
    };
  }
  // ── Descend into a local room (from a region site or a town interior) ─
  const localEntry =
    t.toRoomId && (t.kind === 'site' || t.kind === 'venue') ? t.toRoomId : undefined;
  if (localEntry) {
    const room = roomById(rooms, localEntry);
    if (!room) return { st, narrative: '' };
    const g = roomGrid(room);
    const fromTown = t.kind === 'venue';
    return {
      st: {
        ...st,
        map_level: 'local',
        current_room: room.id,
        marker_pos: g.entry,
        visited_rooms: st.visited_rooms.includes(room.id)
          ? st.visited_rooms
          : [...st.visited_rooms, room.id],
        // Bookmark the cell to return to on ascent (town venue cell or region site cell).
        ...(fromTown ? { town_marker_pos: st.marker_pos } : { region_marker_pos: st.marker_pos }),
      },
      narrative: ` You enter ${room.name}.`,
    };
  }
  // ── Move to another local room via an exit cell ──────────────────────
  if (t.kind === 'room_exit' && t.toRoomId) {
    const room = roomById(rooms, t.toRoomId);
    if (!room) return { st, narrative: '' };
    const g = roomGrid(room);
    const arrive = t.entrancePos ?? g.entry;
    return {
      st: {
        ...st,
        current_room: room.id,
        marker_pos: arrive,
        visited_rooms: st.visited_rooms.includes(room.id)
          ? st.visited_rooms
          : [...st.visited_rooms, room.id],
      },
      narrative: ` You pass into ${room.name}.`,
    };
  }
  // ── Ascend: leave a local site / a town back up a level ──────────────
  if (t.kind === 'ascend') {
    if (t.ascendTo === 'town' && st.current_town_id) {
      const town = townById(campaign, st.current_town_id);
      return {
        st: {
          ...st,
          map_level: 'town',
          current_room: '',
          marker_pos: st.town_marker_pos ?? town?.startPos ?? { x: 0, y: 0 },
        },
        narrative: town ? ` You return to ${town.name}.` : ' You head back out.',
      };
    }
    // → region
    const region = regionById(campaign, st.current_region_id);
    return {
      st: {
        ...st,
        map_level: 'regional',
        current_town_id: undefined,
        current_room: '',
        marker_pos: st.region_marker_pos ?? region?.startPos ?? { x: 0, y: 0 },
      },
      narrative: region ? ` You return to ${region.name}.` : ' You head back to the road.',
    };
  }
  return { st, narrative: '' };
}
