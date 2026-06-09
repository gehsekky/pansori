// 3-level grid map model (regional → town → local). Every level is a tile grid
// with a `feetPerSquare` scale (SRD: regional 5280 / town 25 / local 5). The
// party is a single marker (`GameState.marker_pos`); `resolveMarkerMove` walks it
// (free pathfinding out of combat) and, when it arrives on a transition cell,
// descends/ascends/changes rooms. This is the campaign navigation system that
// replaces Location/District `travel` + the room `connections` graph.

import {
  type CampaignData,
  type EncounterEntry,
  type EncounterZone,
  type FloorType,
  type GameState,
  type GridPos,
  type LevelNarrationHooks,
  type MapLevel,
  type Region,
  type Room,
  type Seed,
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

/** The painted encounter zone covering a square, if any (zones never overlap). */
function encounterZoneAt(region: Region | undefined, pos: GridPos): EncounterZone | undefined {
  return region?.encounterZones?.find((z) => z.cells.some((c) => posEqual(c, pos)));
}

/** The creature name of an encounter entry (a bare string is its own name). */
export function encounterEntryName(e: EncounterEntry): string {
  return typeof e === 'string' ? e : e.name;
}

/**
 * The roll weight of an encounter entry — bare strings weigh 1, and an explicit
 * weight floors at 1 so a stray 0 / negative / non-finite value can't silently
 * drop a creature from the pool (it just becomes the minimum-likelihood entry).
 */
export function encounterEntryWeight(e: EncounterEntry): number {
  const w = typeof e === 'string' ? 1 : e.weight;
  return Number.isFinite(w) && w >= 1 ? Math.floor(w) : 1;
}

/**
 * Weight-proportional pick of a creature name from a NON-EMPTY encounter table.
 * `rnd` is a uniform [0, 1) draw (i.e. `Math.random()`); the table's total
 * weight scales it, then we walk entries subtracting weights. Equal weights
 * reduce to the old uniform pick. The final return guards floating-point drift.
 */
export function pickWeightedEncounter(table: EncounterEntry[], rnd: number): string {
  const total = table.reduce((s, e) => s + encounterEntryWeight(e), 0);
  let r = rnd * total;
  for (const e of table) {
    r -= encounterEntryWeight(e);
    if (r < 0) return encounterEntryName(e);
  }
  return encounterEntryName(table[table.length - 1]);
}

const DEFAULT_LOCAL_GRID = 10;
const DEFAULT_LOCAL_SCALE = 5;
const FEET_PER_MILE = 5280;
// SRD Travel Pace — miles per hour by pace (Fast 4 / Normal 3 / Slow 2;
// 30 / 24 / 18 miles per 8-hour travel day).
export const PACE_MILES_PER_HOUR = { fast: 4, normal: 3, slow: 2 } as const;
export type TravelPace = keyof typeof PACE_MILES_PER_HOUR;
// One marker_move click spends AT MOST one hour of overland travel — the
// SRD's natural travel quantum (the pace table's per-hour column, forced
// march per hour past 8, mounted sprints of 1 hour). The marker halts where
// the hour runs out; the journey is a sequence of clicks.
export const TRAVEL_TURN_MIN = 60;

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
    // Game start counts as entering the starting region — the regionEnter
    // narration hook fires once per region, so record the visit.
    visited_regions: [region.id],
    // The party is on the overland grid, not in any room — clear current_room
    // so no stray room-level choices surface while travelling.
    current_room: '',
  });
}

// Resolve a narration hook value to a single line: a string is itself, an array
// is a random pick (rooms use the pooled `onEnter` form), undefined/empty → ''.
export function pickHookText(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v.length ? v[Math.floor(Math.random() * v.length)] : undefined;
  return v || undefined;
}

// Pick a level's narration hook for an enter/exit. The FIRST variant
// overrides the plain one on the first occurrence; the plain one fires
// every other time. A pooled `onEnter` (rooms) random-picks. Returns ''
// (no leading space) when nothing applies.
function levelHook(
  level: LevelNarrationHooks | undefined,
  kind: 'enter' | 'exit',
  first: boolean
): string {
  if (!level) return '';
  const raw =
    kind === 'enter'
      ? first
        ? (level.onFirstEnter ?? level.onEnter)
        : level.onEnter
      : first
        ? (level.onFirstExit ?? level.onExit)
        : level.onExit;
  const text = pickHookText(raw);
  return text ? ` ${text}` : '';
}

// Track a first occurrence in one of the GameState scope lists. Returns
// whether this was the first time plus the updated list.
function markFirst(list: string[] | undefined, id: string): { first: boolean; list: string[] } {
  const cur = list ?? [];
  return cur.includes(id) ? { first: false, list: cur } : { first: true, list: [...cur, id] };
}

// The regionEnter narration: authored flavor for FIRST entry to a region
// (game start counts — the campaign opens in regions[0]). Chain:
// onFirstEnter ?? onEnter ?? desc — so already-authored regions narrate
// for free. Returns '' when the region carries none of them.
//
// Callers fire this only on first entry (st.visited_regions tracks that);
// region-to-region travel — when it lands — appends the region id there and
// calls this for newly-entered regions.
export function regionEnterNarration(
  campaign: CampaignData | undefined,
  regionId: string | undefined
): string {
  const region = regionById(campaign, regionId);
  const text = pickHookText(region?.onFirstEnter) ?? pickHookText(region?.onEnter) ?? region?.desc;
  return text ? `\n\n${text}` : '';
}

// A transition cell on the active grid — where stepping onto it does something.
export interface MapTransition {
  pos: GridPos;
  kind: 'site' | 'venue' | 'room_exit' | 'ascend';
  label: string;
  // resolution payloads (by kind)
  toTownId?: string; // site → town
  toRoomId?: string; // site/venue → local room, or room_exit → next room
  toRegionId?: string; // site → another region (a region GATE)
  entrancePos?: GridPos; // arrival cell in the destination room / region
  ascendTo?: 'town' | 'region'; // ascend / gate
  // Narration hook (site enter) — authored flavor appended to the
  // "You enter X." line when the transition resolves. A variant pool (pick one).
  onEnter?: string | string[];
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
    scale: DEFAULT_LOCAL_SCALE, // rooms are locked to the SRD 5-ft tactical scale
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
      toRegionId: s.kind === 'region' ? s.regionId : undefined,
      entrancePos: s.kind === 'region' ? s.entryPos : undefined,
      onEnter: s.onEnter,
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
  /** The room id whose layout should be the encounter's battleground, picked
   *  from the zone's `arenaRooms` for the triggering square's terrain. Undefined
   *  ⇒ the default bare arena. */
  encounterArenaRoomId?: string;
  /** Accumulated forced-march notes for the cells crossed this leg. */
  fatigueNote?: string;
  /** When the transition entered a local ROOM, whether it was the party's FIRST
   *  visit. The caller passes this to `buildArrivalNarrative` so the room's
   *  `onFirstEnter` beat fires once and the `onEnter` pool rotates thereafter.
   *  (The room enter hook is emitted by buildArrivalNarrative, not here.) */
  enteredRoomFirst?: boolean;
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
  // Re-issuing the move onto the cell the marker already occupies: a no-op,
  // UNLESS that cell is a transition (site / venue / exit). After ascending you
  // land ON the place you came from, so clicking it should re-enter it rather
  // than reject — no travel, no pathfind, straight to the transition below.
  const stayingPut = posEqual(from, to);
  if (stayingPut && !transitionAt(grid, to)) return reject('Already there.');
  if (to.x < 0 || to.x >= grid.width || to.y < 0 || to.y >= grid.height)
    return reject('Off the map.');
  const path = stayingPut
    ? []
    : (findPath(from, to, grid.obstacles, grid.width, grid.height) ?? []);
  if (!stayingPut && path.length === 0) return reject('No path there.');

  let next: GameState = { ...st, marker_pos: to };
  let squaresMoved = path.length;
  let elapsedHours = 0;
  let encounter: string | undefined;
  let encounterArenaRoomId: string | undefined;
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
    const pace: TravelPace = st.travel_pace ?? 'normal';
    const mph = PACE_MILES_PER_HOUR[pace];
    // Random encounters come ONLY from painted encounter zones — a square not in
    // a zone (or in a zone with an empty creature list) never rolls. The region
    // itself has no chance/table.
    const hasZonePool = (region?.encounterZones ?? []).some(
      (z) => z.encounterChance > 0 && (z.encounterTable ?? []).length > 0
    );
    // E2E determinism: the test-login backend (E2E_TEST_LOGIN_ENABLED, never
    // production) suppresses random wilderness encounters so a scripted journey
    // reliably arrives at its destination instead of being pre-empted by an
    // ambush. Unit tests (vitest, no such env) still roll encounters.
    const encountersDisabled =
      process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_LOGIN_ENABLED === 'true';
    const rollEncounters = !encountersDisabled && hasZonePool;
    const fatigueNotes: string[] = [];
    const crossed: GridPos[] = [from];
    let stopCell: GridPos = to;
    let elapsedMin = 0;
    let hourSpent = false;
    for (const cell of path) {
      const spec = TERRAIN[terrainTypeAt(region?.terrain, cell)];
      // SRD: Travel Pace — minutes to cross this (terrain-weighted) square at
      // the party's chosen pace.
      const cellMin = Math.round((spec.travelMult * milesPerSquare * 60) / mph);
      // The hour cap: stop BEFORE a square that would bust the travel turn —
      // except the first square, so a slow slog can always inch forward.
      if (crossed.length > 1 && elapsedMin + cellMin > TRAVEL_TURN_MIN) {
        stopCell = crossed[crossed.length - 1];
        reachedDest = false;
        hourSpent = true;
        break;
      }
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
      // This square's random encounter — only if the square is painted into a
      // zone with a non-empty creature list. Fires combat right here.
      const zone = encounterZoneAt(region, cell);
      const cellTable = zone?.encounterTable ?? [];
      if (
        rollEncounters &&
        zone &&
        cellTable.length > 0 &&
        Math.random() < zone.encounterChance * spec.encounterMult
      ) {
        encounter = pickWeightedEncounter(cellTable, Math.random());
        // Pick the battleground: a room listed for THIS square's terrain type in
        // the zone's arenaRooms. No entry / empty list ⇒ leave undefined (the
        // caller uses the default bare arena).
        const arena = zone.arenaRooms?.[terrainTypeAt(region?.terrain, cell)] ?? [];
        if (arena.length > 0)
          encounterArenaRoomId = arena[Math.floor(Math.random() * arena.length)];
        stopCell = cell;
        reachedDest = false;
        break;
      }
    }
    elapsedHours = elapsedMin / 60;
    squaresMoved = crossed.length - 1;
    fatigueNote = fatigueNotes.join('');
    if (hourSpent) {
      const miles = Math.round(squaresMoved * milesPerSquare);
      narrative = ` The hour's march covers ${miles} mile${miles === 1 ? '' : 's'}; the journey continues.`;
    }
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
  let enteredRoomFirst: boolean | undefined;
  if (transition) {
    const res = resolveTransition(campaign, rooms, next, transition);
    next = res.st;
    narrative = res.narrative;
    transitioned = true;
    enteredRoomFirst = res.enteredRoomFirst;
  }
  return {
    st: next,
    narrative,
    squaresMoved,
    transitioned,
    elapsedHours,
    encounter,
    encounterArenaRoomId,
    fatigueNote,
    enteredRoomFirst,
  };
}

/**
 * Teleport-style relocation to a VISITED town (Teleport / Teleportation
 * Circle / Word of Recall): the party arrives at the town's startPos with no
 * travel time. The hosting region (found via its town site) becomes current,
 * with the site cell bookmarked so the town gate ascends sensibly. Fires the
 * town enter hooks like any other arrival. Returns null when the town doesn't
 * resolve (deleted since it was visited).
 */
export function relocateToTown(
  campaign: CampaignData | undefined,
  st: GameState,
  townId: string
): { st: GameState; narrative: string } | null {
  const town = townById(campaign, townId);
  if (!town) return null;
  // The region that hosts this town (its 'town' site) — current region + the
  // gate bookmark both come from it. A town no region points at keeps the
  // party's current region (gate ascent falls back to region startPos).
  let hostRegionId = st.current_region_id;
  let siteCell: GridPos | undefined;
  for (const region of campaign?.regions ?? []) {
    const site = region.sites.find((s) => s.kind === 'town' && s.townId === townId);
    if (site) {
      hostRegionId = region.id;
      siteCell = site.pos;
      break;
    }
  }
  const visit = markFirst(st.visited_towns, town.id);
  return {
    st: {
      ...st,
      map_level: 'town',
      current_region_id: hostRegionId,
      current_town_id: town.id,
      marker_pos: town.startPos,
      region_marker_pos: siteCell ?? st.region_marker_pos,
      current_room: '',
      visited_towns: visit.list,
    },
    narrative: ` The world folds and the party stands in ${town.name}.${levelHook(town, 'enter', visit.first)}`,
  };
}

/** Apply a transition the marker stepped onto: descend / ascend / change room. */
export function resolveTransition(
  campaign: CampaignData | undefined,
  rooms: Room[],
  st: GameState,
  t: MapTransition
): { st: GameState; narrative: string; enteredRoomFirst?: boolean } {
  // The site-enter narration hook: authored flavor follows the
  // announcement line every time the party lands on the site's square.
  const siteHook = pickHookText(t.onEnter);
  const hook = siteHook ? ` ${siteHook}` : '';
  // ── Cross into another region (a region GATE site) ───────────────────
  if (t.kind === 'site' && t.toRegionId) {
    const next = regionById(campaign, t.toRegionId);
    if (!next) return { st, narrative: '' };
    const prev = regionById(campaign, st.current_region_id);
    const exit = prev
      ? markFirst(st.exited_regions, prev.id)
      : { first: false, list: st.exited_regions ?? [] };
    const visit = markFirst(st.visited_regions, next.id);
    // First entry uses the regionEnterNarration chain (onFirstEnter ??
    // onEnter ?? desc) so authored regions narrate for free; re-entry
    // plays the plain onEnter.
    const enterText = visit.first
      ? (pickHookText(next.onFirstEnter) ?? pickHookText(next.onEnter) ?? next.desc)
      : pickHookText(next.onEnter);
    return {
      st: {
        ...st,
        map_level: 'regional',
        current_region_id: next.id,
        marker_pos: t.entrancePos ?? next.startPos,
        current_room: '',
        current_town_id: undefined,
        // The old region's descend bookmark means nothing here.
        region_marker_pos: undefined,
        visited_regions: visit.list,
        exited_regions: exit.list,
      },
      narrative: `${levelHook(prev, 'exit', exit.first)} You cross into ${next.name}.${hook}${
        enterText ? ` ${enterText}` : ''
      }`,
    };
  }
  // ── Descend into a town ──────────────────────────────────────────────
  if (t.kind === 'site' && t.toTownId) {
    const town = townById(campaign, t.toTownId);
    if (!town) return { st, narrative: '' };
    const visit = markFirst(st.visited_towns, town.id);
    return {
      st: {
        ...st,
        map_level: 'town',
        current_town_id: town.id,
        marker_pos: town.startPos,
        region_marker_pos: st.marker_pos, // bookmark the region cell for ascent
        current_room: '', // on the town grid, not in any room
        visited_towns: visit.list,
      },
      narrative: ` You enter ${town.name}.${hook}${levelHook(town, 'enter', visit.first)}`,
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
    const visit = markFirst(st.visited_rooms, room.id);
    return {
      st: {
        ...st,
        map_level: 'local',
        current_room: room.id,
        marker_pos: g.entry,
        visited_rooms: visit.list,
        // Bookmark the cell to return to on ascent (town venue cell or region site cell).
        ...(fromTown ? { town_marker_pos: st.marker_pos } : { region_marker_pos: st.marker_pos }),
      },
      // The room's own enter line (pooled `onEnter` / `onFirstEnter`) is emitted
      // by buildArrivalNarrative downstream — see `enteredRoomFirst`.
      narrative: ` You enter ${room.name}.${hook}`,
      enteredRoomFirst: visit.first,
    };
  }
  // ── Move to another local room via an exit cell ──────────────────────
  if (t.kind === 'room_exit' && t.toRoomId) {
    const room = roomById(rooms, t.toRoomId);
    if (!room) return { st, narrative: '' };
    const g = roomGrid(room);
    const arrive = t.entrancePos ?? g.entry;
    const prev = roomById(rooms, st.current_room);
    const exit = prev
      ? markFirst(st.exited_rooms, prev.id)
      : { first: false, list: st.exited_rooms ?? [] };
    const visit = markFirst(st.visited_rooms, room.id);
    return {
      st: {
        ...st,
        current_room: room.id,
        marker_pos: arrive,
        visited_rooms: visit.list,
        exited_rooms: exit.list,
      },
      // Room enter line emitted by buildArrivalNarrative downstream (enteredRoomFirst).
      narrative: `${levelHook(prev, 'exit', exit.first)} You pass into ${room.name}.`,
      enteredRoomFirst: visit.first,
    };
  }
  // ── Ascend: leave a local site / a town back up a level ──────────────
  if (t.kind === 'ascend') {
    if (t.ascendTo === 'town' && st.current_town_id) {
      const town = townById(campaign, st.current_town_id);
      const prev = roomById(rooms, st.current_room);
      const exit = prev
        ? markFirst(st.exited_rooms, prev.id)
        : { first: false, list: st.exited_rooms ?? [] };
      return {
        st: {
          ...st,
          map_level: 'town',
          current_room: '',
          marker_pos: st.town_marker_pos ?? town?.startPos ?? { x: 0, y: 0 },
          exited_rooms: exit.list,
        },
        // The town is NOT re-entered — it never left scope while the party
        // was inside one of its rooms.
        narrative: `${levelHook(prev, 'exit', exit.first)}${town ? ` You return to ${town.name}.` : ' You head back out.'}`,
      };
    }
    // → region: from a town gate (exits the TOWN scope) or straight up
    // from a dungeon room (exits the ROOM). The region itself never left
    // scope, so no region enter hook fires.
    const region = regionById(campaign, st.current_region_id);
    let exitText = '';
    let exitedRooms = st.exited_rooms;
    let exitedTowns = st.exited_towns;
    if (st.current_room) {
      const prev = roomById(rooms, st.current_room);
      if (prev) {
        const exit = markFirst(st.exited_rooms, prev.id);
        exitText = levelHook(prev, 'exit', exit.first);
        exitedRooms = exit.list;
      }
    } else if (st.current_town_id) {
      const town = townById(campaign, st.current_town_id);
      if (town) {
        const exit = markFirst(st.exited_towns, town.id);
        exitText = levelHook(town, 'exit', exit.first);
        exitedTowns = exit.list;
      }
    }
    return {
      st: {
        ...st,
        map_level: 'regional',
        current_town_id: undefined,
        current_room: '',
        marker_pos: st.region_marker_pos ?? region?.startPos ?? { x: 0, y: 0 },
        exited_rooms: exitedRooms,
        exited_towns: exitedTowns,
      },
      narrative: `${exitText}${region ? ` You return to ${region.name}.` : ' You head back to the road.'}`,
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
 * Give the transient encounter room (`__encounter__`) the battleground layout of
 * an authored room, so a rolled encounter is fought on that room's map instead
 * of the default bare arena. Copies ONLY the tactical + cosmetic layout (floor,
 * lighting, obstacles, difficult/climb/swim terrain, cover, cosmetic paint) — the
 * room's own enemies/loot/NPCs/exits/objects do NOT come along; it's borrowed as
 * a battleground only. The borrowed room's combat grid SIZE comes along too
 * (`gridWidth`/`gridHeight`, when set), so a fight staged on an authored arena
 * uses that arena's dimensions (clamped at read time via `combatGridDims`).
 *
 * Pass `undefined` (or an id with no matching room) to clear any borrowed arena
 * left from a previous encounter so the default bare grid is used. Mutates
 * `seed.rooms` in place.
 */
export function applyEncounterArena(seed: Seed, arenaRoomId: string | undefined): void {
  const rooms = (seed.rooms ?? []).filter((r) => r.id !== ENCOUNTER_ROOM_ID);
  const src = arenaRoomId ? rooms.find((r) => r.id === arenaRoomId) : undefined;
  if (src) {
    rooms.push({
      id: ENCOUNTER_ROOM_ID,
      name: src.name,
      desc: src.desc,
      ...(src.floor !== undefined ? { floor: src.floor } : {}),
      ...(src.lighting !== undefined ? { lighting: src.lighting } : {}),
      ...(src.obstacles ? { obstacles: src.obstacles } : {}),
      ...(src.difficultTerrain ? { difficultTerrain: src.difficultTerrain } : {}),
      ...(src.climbTerrain ? { climbTerrain: src.climbTerrain } : {}),
      ...(src.swimTerrain ? { swimTerrain: src.swimTerrain } : {}),
      ...(src.coverPositions ? { coverPositions: src.coverPositions } : {}),
      ...(src.terrain ? { terrain: src.terrain } : {}),
      ...(src.gridWidth !== undefined ? { gridWidth: src.gridWidth } : {}),
      ...(src.gridHeight !== undefined ? { gridHeight: src.gridHeight } : {}),
    });
  }
  seed.rooms = rooms;
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
