// 3-level grid map model (regional → town → local). Every level is a tile grid
// with a `feetPerSquare` scale (SRD: regional 5280 / town 25 / local 5). The
// party is a single marker (`GameState.marker_pos`); `resolveMarkerMove` walks it
// (free pathfinding out of combat) and, when it arrives on a transition cell,
// descends/ascends/changes rooms. This is the campaign navigation system that
// replaces Location/District `travel` + the room `connections` graph.

import {
  type CampaignData,
  type FloorType,
  type GameState,
  type GridPos,
  type MapLevel,
  type Region,
  type Room,
  TERRAIN,
  type TerrainCell,
  type TerrainType,
  type Town,
} from '../types.js';
import { findPath, posEqual } from './gridEngine.js';

/**
 * The grid's impassable set: legacy `obstacles` + impassable terrain cells
 * (mountain / water), MINUS any cell that's a travel destination. A site /
 * venue / exit must always be reachable, so terrain painted on its square never
 * walls it off — the transition wins.
 */
function mergeObstacles(
  legacy: GridPos[] | undefined,
  terrain: TerrainCell[] | undefined,
  transitions: MapTransition[]
): GridPos[] {
  const impassable = (terrain ?? []).filter((c) => !TERRAIN[c.type].passable).map((c) => c.pos);
  const transitionKeys = new Set(transitions.map((t) => `${t.pos.x},${t.pos.y}`));
  return [...(legacy ?? []), ...impassable].filter((o) => !transitionKeys.has(`${o.x},${o.y}`));
}

/** Terrain type at a cell — defaults to `plains` for any unlisted square. */
function terrainTypeAt(terrain: TerrainCell[] | undefined, pos: GridPos): TerrainType {
  return terrain?.find((c) => posEqual(c.pos, pos))?.type ?? 'plains';
}

const DEFAULT_LOCAL_GRID = 10;
const DEFAULT_LOCAL_SCALE = 5;
const FEET_PER_MILE = 5280;
const NORMAL_MILES_PER_HOUR = 3; // SRD Travel Pace — Normal (3 mi/hr, 24 mi/day)

// The transient room id a wilderness encounter fights in. Not an authored room —
// `activeGrid` returns null for it (no marker movement mid-fight); combat uses the
// campaign's default combat grid. Cleared on return.
export const ENCOUNTER_ROOM_ID = '__encounter__';

/**
 * Place the party on the regional grid at campaign start. No-op unless the
 * campaign uses the new map model (`regions`) and map state isn't already set.
 */
// Fog of war: the party's overland sight radius. 1 regional square = 1 mile
// (feetPerSquare 5280), so a 3-square radius ≈ the ~3-mile real-world horizon.
export const SIGHT_RADIUS = 3;

// Permanently reveal every cell within SIGHT_RADIUS (circular, Euclidean) of
// EACH given cell in `regionId`, accumulating into `GameState.revealed_cells`.
// Takes the region id explicitly (rather than reading `st.map_level`) so it can
// bank the overland route even after a move descended into a town. Idempotent.
export function revealRegionalCells(
  campaign: CampaignData | undefined,
  st: GameState,
  regionId: string,
  cells: GridPos[]
): GameState {
  const region = regionById(campaign, regionId);
  if (!region) return st;
  const r = SIGHT_RADIUS;
  const seen = new Set(st.revealed_cells?.[regionId] ?? []);
  for (const { x: cx, y: cy } of cells) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue; // circular sight
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= region.gridWidth || y >= region.gridHeight) continue;
        seen.add(`${x},${y}`);
      }
    }
  }
  return {
    ...st,
    revealed_cells: { ...(st.revealed_cells ?? {}), [regionId]: [...seen] },
  };
}

// Reveal the sight radius around the party's current marker. No-op off the
// regional grid. (Single-cell convenience over `revealRegionalCells` — used for
// the initial reveal and any non-travel reposition.)
export function revealRegional(campaign: CampaignData | undefined, st: GameState): GameState {
  if (st.map_level !== 'regional' || !st.current_region_id || !st.marker_pos) return st;
  return revealRegionalCells(campaign, st, st.current_region_id, [st.marker_pos]);
}

export function initMapState(campaign: CampaignData | undefined, st: GameState): GameState {
  const region = campaign?.regions?.[0];
  if (!region || st.map_level) return st;
  return revealRegional(campaign, {
    ...st,
    map_level: 'regional',
    current_region_id: region.id,
    marker_pos: region.startPos,
    // The party is on the overland grid, not in any room — clear current_room
    // so no stray room-level choices surface while travelling.
    current_room: '',
  });
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
  // Typed terrain for this grid (regions/towns author it; local rooms leave it
  // empty). Impassable terrain is also folded into `obstacles` for pathfinding.
  terrain: TerrainCell[];
  obstacles: GridPos[];
  transitions: MapTransition[];
  startPos: GridPos;
  // Cosmetic floor texture for a local room (undefined for region/town grids,
  // which render terrain tiles instead). Defaults to 'cobblestone' when the
  // room doesn't author one. See Room.floor.
  floor?: FloorType;
}

export function regionById(campaign: CampaignData | undefined, id?: string): Region | undefined {
  return campaign?.regions?.find((r) => r.id === id);
}

/**
 * The encounter-difficulty tier of an overland square (SRD Tiers of Play,
 * loosely): the highest tier among the region's `tierZones` rectangles covering
 * `pos`, else the region's `baseTier` (default 1). Forward-looking data for
 * procedural wilderness encounters — it lets the generator pick creatures scaled
 * to the party level expected in that part of the map. No mechanics today.
 */
export function regionTierAt(region: Region, pos: GridPos): number {
  let tier = region.baseTier ?? 1;
  for (const z of region.tierZones ?? []) {
    const inX = pos.x >= Math.min(z.from.x, z.to.x) && pos.x <= Math.max(z.from.x, z.to.x);
    const inY = pos.y >= Math.min(z.from.y, z.to.y) && pos.y <= Math.max(z.from.y, z.to.y);
    if (inX && inY) tier = Math.max(tier, z.tier);
  }
  return tier;
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
    const transitions: MapTransition[] = region.sites.map((s) => ({
      pos: s.pos,
      kind: 'site' as const,
      label: s.name,
      toTownId: s.kind === 'town' ? s.townId : undefined,
      toRoomId: s.kind === 'local' ? s.entryRoomId : undefined,
    }));
    return {
      level,
      id: region.id,
      name: region.name,
      width: region.gridWidth,
      height: region.gridHeight,
      feetPerSquare: region.feetPerSquare,
      terrain: region.terrain ?? [],
      obstacles: mergeObstacles(region.obstacles, region.terrain, transitions),
      startPos: region.startPos,
      transitions,
    };
  }
  if (level === 'town') {
    const town = townById(campaign, st.current_town_id);
    if (!town) return null;
    const transitions: MapTransition[] = town.venues.map((v) => ({
      pos: v.pos,
      kind: v.kind === 'gate' ? ('ascend' as const) : ('venue' as const),
      label: v.name,
      toRoomId: v.kind === 'interior' ? v.entryRoomId : undefined,
      ascendTo: v.kind === 'gate' ? ('region' as const) : undefined,
    }));
    return {
      level,
      id: town.id,
      name: town.name,
      width: town.gridWidth,
      height: town.gridHeight,
      feetPerSquare: town.feetPerSquare,
      terrain: town.terrain ?? [],
      obstacles: mergeObstacles(town.obstacles, town.terrain, transitions),
      startPos: town.startPos,
      transitions,
      floor: town.floor ?? 'dirt',
    };
  }
  if (level === 'local') {
    const room = roomById(rooms, st.current_room);
    if (!room) return null;
    const g = roomGrid(room);
    const transitions: MapTransition[] = (room.exits ?? []).map((e) => ({
      pos: e.pos,
      kind: e.ascends ? ('ascend' as const) : ('room_exit' as const),
      label: e.label ?? (e.ascends ? 'Exit' : 'Passage'),
      toRoomId: e.toRoomId,
      entrancePos: e.entrancePos,
      // Ascend from a local room: to the town if we're inside one, else region.
      ascendTo: e.ascends ? (st.current_town_id ? 'town' : 'region') : undefined,
    }));
    return {
      level,
      id: room.id,
      name: room.name,
      width: g.width,
      height: g.height,
      feetPerSquare: g.scale,
      // Cosmetic room terrain (the same paint GridCombatView shows in combat) is
      // now surfaced in exploration too. Impassable terrain types fold into the
      // obstacle set so they block marker travel the way town / region do.
      terrain: room.terrain ?? [],
      obstacles: mergeObstacles(room.obstacles, room.terrain, transitions),
      startPos: g.entry,
      transitions,
      floor: room.floor ?? 'cobblestone',
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
  /** Squares the marker actually crossed (it stops early at an event cell). */
  squaresMoved: number;
  /** A transition was resolved at the destination (descend/ascend/room change). */
  transitioned: boolean;
  /** Travel time the (possibly-interrupted) leg cost in hours (regional only). */
  elapsedHours: number;
  /** A random encounter triggered en route — the rolled enemy template name. The
   *  marker is left ON the encounter cell; the caller drops into combat there. */
  encounter?: string;
  /** Accumulated forced-march notes for the cells crossed this leg. */
  fatigueNote?: string;
  rejected?: string;
}

/**
 * Per-cell forced-march hook supplied by the caller (it owns the action context
 * the fatigue rules need). Applied as the marker crosses each regional cell so a
 * collapse halts the party AT that cell. Returns the updated state, a note, and
 * whether the increment killed anyone (which stops the march).
 */
export type TravelFatigueFn = (
  st: GameState,
  minutes: number
) => { st: GameState; note: string; died: boolean };

/**
 * Move the party marker to `to` on the current grid (free pathfinding — no combat
 * budget). If `to` is a transition cell, resolve it (descend a site/venue, change
 * room, or ascend). Returns the updated state + how far the marker travelled.
 */
export function resolveMarkerMove(
  campaign: CampaignData | undefined,
  rooms: Room[],
  st: GameState,
  to: GridPos,
  applyFatigue?: TravelFatigueFn
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
  let squaresMoved = path.length;
  let elapsedHours = 0;
  let encounter: string | undefined;
  let fatigueNote: string | undefined;
  let narrative = '';
  // Whether the marker actually settled on `to` (vs. stopping early at an event).
  let reachedDest = true;

  // ── Regional travel: walk the route SQUARE BY SQUARE, stopping at the first
  //    interrupt so the party halts where it happens. Per cell: spend that
  //    square's SRD travel time (applying forced-march fatigue as it accrues),
  //    then roll that square's random encounter. A fatigue death or an encounter
  //    leaves the marker ON that cell and abandons the rest of the path — the
  //    player re-issues the move to press on. Fog is revealed only for the cells
  //    actually crossed. ──────────────────────────────────────────────────────
  if (grid.level === 'regional') {
    const region = regionById(campaign, st.current_region_id);
    const milesPerSquare = grid.feetPerSquare / FEET_PER_MILE;
    const chance = region?.encounterChance ?? 0;
    const table = region?.encounterTable ?? [];
    // E2E determinism: the test-login backend (E2E_TEST_LOGIN_ENABLED, never
    // production) suppresses random wilderness encounters so a scripted journey
    // reliably arrives at its destination instead of being pre-empted by an
    // ambush. Unit tests (vitest, no such env) still roll encounters.
    const encountersDisabled =
      process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_LOGIN_ENABLED === 'true';
    const rollEncounters = !encountersDisabled && chance > 0 && table.length > 0;
    const fatigueNotes: string[] = [];
    const crossed: GridPos[] = [from];
    let stopCell: GridPos = to;
    let elapsedMin = 0;
    for (const cell of path) {
      const spec = TERRAIN[terrainTypeAt(region?.terrain, cell)];
      // SRD: Travel Pace — Normal 3 mi/hr. Minutes to cross this (weighted) square.
      const cellMin = Math.round((spec.travelMult * milesPerSquare * 60) / NORMAL_MILES_PER_HOUR);
      // Fatigue accrues as we cross the square; a collapse stops the party here.
      if (applyFatigue && cellMin > 0) {
        const r = applyFatigue(next, cellMin);
        next = r.st;
        if (r.note) fatigueNotes.push(r.note);
        elapsedMin += cellMin;
        crossed.push(cell);
        if (r.died) {
          stopCell = cell;
          reachedDest = false;
          break;
        }
      } else {
        elapsedMin += cellMin;
        crossed.push(cell);
      }
      // This square's random encounter — fires the party into combat right here.
      if (rollEncounters && Math.random() < chance * spec.encounterMult) {
        encounter = table[Math.floor(Math.random() * table.length)];
        stopCell = cell;
        reachedDest = false;
        break;
      }
    }
    elapsedHours = elapsedMin / 60;
    squaresMoved = crossed.length - 1;
    fatigueNote = fatigueNotes.join('');
    next = {
      ...next,
      marker_pos: stopCell,
      world_minute: (st.world_minute ?? 0) + elapsedMin,
    };
    // Fog of war — reveal only the cells actually crossed (the marker may have
    // stopped short). Done before any transition flips map_level to 'town'.
    if (st.current_region_id) {
      next = revealRegionalCells(campaign, next, st.current_region_id, crossed);
    }
  }

  // ── Resolve a transition cell only when the marker actually settled on `to` ──
  // (a mid-route encounter / collapse leaves it short, so no descend happens).
  const transition = reachedDest ? transitionAt(grid, next.marker_pos ?? to) : undefined;
  let transitioned = false;
  if (transition) {
    const res = resolveTransition(campaign, rooms, next, transition);
    next = res.st;
    narrative = res.narrative;
    transitioned = true;
  }
  return { st: next, narrative, squaresMoved, transitioned, elapsedHours, encounter, fatigueNote };
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
        current_room: '', // on the town grid, not in any room
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

/**
 * Drop the party off the map into a transient local combat (a rolled wilderness
 * encounter). Bookmarks the current grid position in `encounter_return` so
 * `returnFromEncounter` can march them back once the fight collapses, and puts
 * the party in the encounter room. The caller seeds the actual enemy into
 * `seed.enemies[ENCOUNTER_ROOM_ID]` (enemies live on the run seed, not state);
 * combat then spins up the usual way (PC entities deploy on the first attack).
 */
export function stageEncounter(st: GameState): GameState {
  return {
    ...st,
    encounter_return: {
      level: st.map_level ?? 'regional',
      region_id: st.current_region_id,
      town_id: st.current_town_id,
      pos: st.marker_pos ?? { x: 0, y: 0 },
    },
    map_level: 'local',
    current_room: ENCOUNTER_ROOM_ID,
    marker_pos: { x: 1, y: 1 },
  };
}

/**
 * Collapse a wilderness encounter once combat ends: march the party back to the
 * grid cell they were travelling on (the `encounter_return` bookmark). No-op
 * when the party isn't returning from an encounter. Called from
 * `endCombatState` so every victory/flee path returns to the map. (The dead
 * encounter enemy stays in `seed.enemies[ENCOUNTER_ROOM_ID]` flagged killed —
 * harmless once `current_room` leaves it; a fresh encounter overwrites it.)
 */
export function returnFromEncounter(st: GameState): GameState {
  const ret = st.encounter_return;
  if (!ret) return st;
  return {
    ...st,
    map_level: ret.level,
    current_region_id: ret.region_id,
    current_town_id: ret.town_id,
    current_room: '',
    marker_pos: ret.pos,
    encounter_return: undefined,
  };
}
