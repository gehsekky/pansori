// DB-first campaign content resolution.
//
// A campaign's data starts with its DB record and is supplemented by the
// code in campaignData/: any top-level Context field present in the DB wins;
// everything absent falls through to the code-defined context. This is the
// bridge for moving content into the database section by section — e.g.
// once narratives are DB-edited, `data.narratives` overrides the code
// narratives while enemyTemplates/lootTable/etc. keep coming from code.
//
// Storage is per section: most sections live as keys in the campaigns.data
// JSONB; sections that have graduated to their own relational table
// (regions → campaign_regions) are mapped rows ↔ the same JSON shape, so
// the content API and editor UI don't care where a section lives.
//
// The merge is deliberately SHALLOW at the top level of Context: a DB
// field replaces that field wholesale (no deep merge), so the editing
// surface always reads/writes a whole section and the engine never sees a
// half-merged structure. Section-level granularity is what the admin
// section will edit anyway.
//
// Applied once at startup (index.ts), after migrations + registry sync —
// the campaigns table is guaranteed to exist by then, unlike at module
// import when the context store loads the code contexts. Content edits
// (routes/campaigns.ts) re-apply the overlay for the edited campaign via
// refreshCampaignOverlay, so changes go live without a restart.

import type {
  Context,
  Enemy,
  EnemyTemplate,
  FloorType,
  GridPos,
  LootItem,
  PlacedLoot,
  PlacedNpc,
  Region,
  Room,
  RoomExit,
  TerrainCell,
  TerrainType,
  TierZone,
  Town,
} from '../types.js';
import {
  composeEnemyTemplates,
  deleteCampaignCustomMonsters,
  getCampaignCustomMonsters,
  getMonsterCatalog,
  putCampaignCustomMonsters,
} from './monsterCatalog.js';
import {
  composeLootTable,
  deleteCampaignCustomItems,
  getCampaignCustomItems,
  getItemCatalog,
  putCampaignCustomItems,
} from './itemCatalog.js';
import type { Pool } from 'pg';
import { baseCampaignContext } from '../campaignData/srd/baseCampaign.js';
import { materializeEnemy } from './enemyFactory.js';

// The code supplement for a DB-born campaign (no campaignData/ folder):
// the base template, re-keyed to the campaign's id. Everything the
// creator hasn't (or can't yet) put in the DB comes from here.
export function baseContextFor(campaignId: string): Context {
  return { ...baseCampaignContext, id: campaignId };
}

// The Context sections editable through the content API. Grows as zod
// schemas land per section (routes/schemas.ts CAMPAIGN_SECTION_SCHEMAS must
// stay in lockstep — there's a spec asserting that). Order is the display
// order in the admin UI.
//
// 'regions' / 'towns' / 'rooms' are DB-era sections with no code-context
// counterpart — stored relationally in campaign_regions / campaign_towns /
// campaign_rooms. They're LIVE: loadOverlay converts them (dbRegionsToEngine
// / dbTownsToEngine / dbRoomsToEngine) and folds them into the campaign
// block, replacing the code maps wholesale. NOTE the wholesale semantics
// for rooms in particular: a campaign with ANY DB rooms serves ONLY those
// rooms — code/template rooms (and anything keyed to their ids, e.g.
// placed enemies/loot) stop resolving until those sections migrate too.
//
// 'gameStart' is the game-start narration hook: a campaigns.data key that
// loadOverlay folds into campaign.intro (the first narrative entry of a
// new game), replacing the code/template opening.
//
// 'terrainArt' is the campaign's tile skin (terrain type → TERRAIN_TILES
// id): a campaigns.data key that overlays Context.terrainArt top-level and
// rides into the seed (procgen) so the FE map renders it.
//
// 'customItems' / 'customMonsters' are a campaign's OWN content on top of
// the ambient SRD catalogs (services/itemCatalog.ts / monsterCatalog.ts):
// every campaign automatically gets the full catalogs; customs add to them
// and shadow same-id (items) / same-name (monsters) catalog entries. The
// composed lootTable / enemyTemplates are LIVE engine fields.
export const EDITABLE_SECTIONS = [
  'gameStart',
  'narratives',
  'regions',
  'towns',
  'rooms',
  'terrainArt',
  'customItems',
  'customMonsters',
] as const;
export type EditableSection = (typeof EDITABLE_SECTIONS)[number];

export function isEditableSection(s: string): s is EditableSection {
  return (EDITABLE_SECTIONS as readonly string[]).includes(s);
}

// Top-level Context fields that may NOT be overridden from the DB: the id
// is the registry key, and campaign identity fields the engine relies on
// for routing stay code-owned until campaigns are fully DB-authored.
const PROTECTED_FIELDS = new Set(['id']);

export function mergeContextWithOverlay(code: Context, overlay: Record<string, unknown>): Context {
  const merged: Record<string, unknown> = { ...(code as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overlay)) {
    if (PROTECTED_FIELDS.has(key)) continue;
    if (value === null || value === undefined) continue;
    merged[key] = value;
  }
  return merged as unknown as Context;
}

// ─── Regions (relational storage — campaign_regions) ────────────────────────

// The JSON shape the content API serves — matches the regions section
// schema in routes/schemas.ts and what the editor round-trips.
export interface CampaignRegionSite {
  id: string;
  name: string;
  pos: { x: number; y: number };
  kind: 'town' | 'local';
  townId?: string;
  entryRoomId?: string;
  desc?: string;
  // Narration hook — fires every time the party lands on this site.
  onEnter?: string;
  icon?: string;
}

// One square of the dense terrain grid: `t` is the terrain type (behavior
// derives from the shared TERRAIN registry); `tier` / `enc` are rare
// per-cell overrides of the region-level defaults.
export interface CampaignRegionCell {
  t: string;
  tier?: number;
  enc?: number;
}

export interface CampaignRegion {
  id: string;
  name: string;
  isStartingRegion: boolean;
  desc?: string;
  // Level narration hooks (FIRST variant overrides plain on the first
  // occurrence; region first-enter falls back to desc; region exits are
  // dormant until region travel exists).
  onEnter?: string;
  onFirstEnter?: string;
  onExit?: string;
  onFirstExit?: string;
  feetPerSquare: number;
  // Dense [y][x] terrain grid — dimensions derive from its shape
  // (validated rectangular at the API). Stored as a JSONB column.
  grid: CampaignRegionCell[][];
  startPos: { x: number; y: number };
  encounterChance?: number;
  baseTier?: number;
  // Transition cells — stored in campaign_region_sites, authored inside
  // the region's JSON. Present only when the region has sites.
  sites?: CampaignRegionSite[];
}

interface RegionRow {
  id: string;
  name: string;
  is_starting_region: boolean;
  description: string | null;
  on_enter: string | null;
  on_first_enter: string | null;
  on_exit: string | null;
  on_first_exit: string | null;
  feet_per_square: number;
  grid: CampaignRegionCell[][];
  start_x: number;
  start_y: number;
  encounter_chance: number | null;
  base_tier: number | null;
}

function rowToRegion(r: RegionRow): CampaignRegion {
  return {
    id: r.id,
    name: r.name,
    isStartingRegion: r.is_starting_region,
    ...(r.description !== null ? { desc: r.description } : {}),
    ...(r.on_enter !== null ? { onEnter: r.on_enter } : {}),
    ...(r.on_first_enter !== null ? { onFirstEnter: r.on_first_enter } : {}),
    ...(r.on_exit !== null ? { onExit: r.on_exit } : {}),
    ...(r.on_first_exit !== null ? { onFirstExit: r.on_first_exit } : {}),
    feetPerSquare: r.feet_per_square,
    grid: r.grid,
    startPos: { x: r.start_x, y: r.start_y },
    ...(r.encounter_chance !== null ? { encounterChance: r.encounter_chance } : {}),
    ...(r.base_tier !== null ? { baseTier: r.base_tier } : {}),
  };
}

const REGION_COLUMNS = `id, name, is_starting_region, description, on_enter, feet_per_square,
       grid, start_x, start_y, encounter_chance, base_tier, on_first_enter, on_exit,
       on_first_exit`;

interface SiteRow {
  region_id: string;
  id: string;
  name: string;
  pos_x: number;
  pos_y: number;
  kind: 'town' | 'local';
  town_id: string | null;
  entry_room_id: string | null;
  description: string | null;
  on_enter: string | null;
  icon: string | null;
}

function rowToSite(r: SiteRow): CampaignRegionSite {
  return {
    id: r.id,
    name: r.name,
    pos: { x: r.pos_x, y: r.pos_y },
    kind: r.kind,
    ...(r.town_id !== null ? { townId: r.town_id } : {}),
    ...(r.entry_room_id !== null ? { entryRoomId: r.entry_room_id } : {}),
    ...(r.description !== null ? { desc: r.description } : {}),
    ...(r.on_enter !== null ? { onEnter: r.on_enter } : {}),
    ...(r.icon !== null ? { icon: r.icon } : {}),
  };
}

export async function getCampaignRegions(
  pool: Pool,
  campaignId: string
): Promise<CampaignRegion[]> {
  const { rows } = await pool.query<RegionRow>(
    `SELECT ${REGION_COLUMNS}
       FROM campaign_regions
      WHERE campaign_id = $1
      ORDER BY sort_order, id`,
    [campaignId]
  );
  if (rows.length === 0) return [];
  const { rows: siteRows } = await pool.query<SiteRow>(
    `SELECT region_id, id, name, pos_x, pos_y, kind, town_id, entry_room_id, description,
            on_enter, icon
       FROM campaign_region_sites
      WHERE campaign_id = $1
      ORDER BY region_id, sort_order, id`,
    [campaignId]
  );
  const sitesByRegion = new Map<string, CampaignRegionSite[]>();
  for (const row of siteRows) {
    const list = sitesByRegion.get(row.region_id) ?? [];
    list.push(rowToSite(row));
    sitesByRegion.set(row.region_id, list);
  }
  return rows.map((r) => {
    const region = rowToRegion(r);
    const sites = sitesByRegion.get(r.id);
    return sites && sites.length > 0 ? { ...region, sites } : region;
  });
}

// Replace-all write, matching the editor's whole-section semantics: the
// posted list becomes the campaign's regions, in order, transactionally.
export async function putCampaignRegions(
  pool: Pool,
  campaignId: string,
  regions: CampaignRegion[]
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    // Replace-all: deleting the regions cascades their sites away too.
    await client.query('DELETE FROM campaign_regions WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      await client.query(
        `INSERT INTO campaign_regions
           (campaign_id, id, sort_order, name, is_starting_region, description,
            on_enter, feet_per_square, grid, start_x, start_y, encounter_chance, base_tier,
            on_first_enter, on_exit, on_first_exit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16)`,
        [
          campaignId,
          r.id,
          i,
          r.name,
          r.isStartingRegion,
          r.desc ?? null,
          r.onEnter ?? null,
          r.feetPerSquare,
          JSON.stringify(r.grid),
          r.startPos.x,
          r.startPos.y,
          r.encounterChance ?? null,
          r.baseTier ?? null,
          r.onFirstEnter ?? null,
          r.onExit ?? null,
          r.onFirstExit ?? null,
        ]
      );
      const sites = r.sites ?? [];
      for (let j = 0; j < sites.length; j++) {
        const s = sites[j];
        await client.query(
          `INSERT INTO campaign_region_sites
             (campaign_id, region_id, id, sort_order, name, pos_x, pos_y, kind,
              town_id, entry_room_id, description, on_enter, icon)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            campaignId,
            r.id,
            s.id,
            j,
            s.name,
            s.pos.x,
            s.pos.y,
            s.kind,
            s.townId ?? null,
            s.entryRoomId ?? null,
            s.desc ?? null,
            s.onEnter ?? null,
            s.icon ?? null,
          ]
        );
      }
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCampaignRegions(pool: Pool, campaignId: string): Promise<boolean> {
  // Deleting zero rows is still success IF the campaign exists — reverting
  // an already-empty section is a no-op, not an error.
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_regions WHERE campaign_id = $1', [campaignId]);
  return true;
}

// ─── Towns (relational storage — campaign_towns + campaign_town_venues) ──────

export interface CampaignTownVenue {
  id: string;
  name: string;
  pos: { x: number; y: number };
  kind: 'interior' | 'gate';
  entryRoomId?: string;
  desc?: string;
}

export interface CampaignTown {
  id: string;
  name: string;
  desc?: string;
  // Level narration hooks (enter via a region site; exit via the gate —
  // venue descends stay inside the town's scope).
  onEnter?: string;
  onFirstEnter?: string;
  onExit?: string;
  onFirstExit?: string;
  feetPerSquare: number;
  grid: CampaignRegionCell[][];
  startPos: { x: number; y: number };
  venues?: CampaignTownVenue[];
  floor?: FloorType;
}

interface TownRow {
  id: string;
  name: string;
  description: string | null;
  on_enter: string | null;
  on_first_enter: string | null;
  on_exit: string | null;
  on_first_exit: string | null;
  feet_per_square: number;
  grid: CampaignRegionCell[][];
  start_x: number;
  start_y: number;
  floor: FloorType | null;
}

interface VenueRow {
  town_id: string;
  id: string;
  name: string;
  pos_x: number;
  pos_y: number;
  kind: 'interior' | 'gate';
  entry_room_id: string | null;
  description: string | null;
}

function rowToVenue(r: VenueRow): CampaignTownVenue {
  return {
    id: r.id,
    name: r.name,
    pos: { x: r.pos_x, y: r.pos_y },
    kind: r.kind,
    ...(r.entry_room_id !== null ? { entryRoomId: r.entry_room_id } : {}),
    ...(r.description !== null ? { desc: r.description } : {}),
  };
}

export async function getCampaignTowns(pool: Pool, campaignId: string): Promise<CampaignTown[]> {
  const { rows } = await pool.query<TownRow>(
    `SELECT id, name, description, feet_per_square, grid, start_x, start_y, floor,
            on_enter, on_first_enter, on_exit, on_first_exit
       FROM campaign_towns
      WHERE campaign_id = $1
      ORDER BY sort_order, id`,
    [campaignId]
  );
  if (rows.length === 0) return [];
  const { rows: venueRows } = await pool.query<VenueRow>(
    `SELECT town_id, id, name, pos_x, pos_y, kind, entry_room_id, description
       FROM campaign_town_venues
      WHERE campaign_id = $1
      ORDER BY town_id, sort_order, id`,
    [campaignId]
  );
  const venuesByTown = new Map<string, CampaignTownVenue[]>();
  for (const row of venueRows) {
    const list = venuesByTown.get(row.town_id) ?? [];
    list.push(rowToVenue(row));
    venuesByTown.set(row.town_id, list);
  }
  return rows.map((r) => {
    const town: CampaignTown = {
      id: r.id,
      name: r.name,
      ...(r.description !== null ? { desc: r.description } : {}),
      ...(r.on_enter !== null ? { onEnter: r.on_enter } : {}),
      ...(r.on_first_enter !== null ? { onFirstEnter: r.on_first_enter } : {}),
      ...(r.on_exit !== null ? { onExit: r.on_exit } : {}),
      ...(r.on_first_exit !== null ? { onFirstExit: r.on_first_exit } : {}),
      feetPerSquare: r.feet_per_square,
      grid: r.grid,
      startPos: { x: r.start_x, y: r.start_y },
      ...(r.floor !== null ? { floor: r.floor } : {}),
    };
    const venues = venuesByTown.get(r.id);
    return venues && venues.length > 0 ? { ...town, venues } : town;
  });
}

// Replace-all write — deleting the towns cascades their venues away too.
export async function putCampaignTowns(
  pool: Pool,
  campaignId: string,
  towns: CampaignTown[]
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('DELETE FROM campaign_towns WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < towns.length; i++) {
      const t = towns[i];
      await client.query(
        `INSERT INTO campaign_towns
           (campaign_id, id, sort_order, name, description, feet_per_square,
            grid, start_x, start_y, floor, on_enter, on_first_enter, on_exit, on_first_exit)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14)`,
        [
          campaignId,
          t.id,
          i,
          t.name,
          t.desc ?? null,
          t.feetPerSquare,
          JSON.stringify(t.grid),
          t.startPos.x,
          t.startPos.y,
          t.floor ?? null,
          t.onEnter ?? null,
          t.onFirstEnter ?? null,
          t.onExit ?? null,
          t.onFirstExit ?? null,
        ]
      );
      const venues = t.venues ?? [];
      for (let j = 0; j < venues.length; j++) {
        const v = venues[j];
        await client.query(
          `INSERT INTO campaign_town_venues
             (campaign_id, town_id, id, sort_order, name, pos_x, pos_y, kind,
              entry_room_id, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            campaignId,
            t.id,
            v.id,
            j,
            v.name,
            v.pos.x,
            v.pos.y,
            v.kind,
            v.entryRoomId ?? null,
            v.desc ?? null,
          ]
        );
      }
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCampaignTowns(pool: Pool, campaignId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_towns WHERE campaign_id = $1', [campaignId]);
  return true;
}

// Convert DB towns into the engine model — same dense→sparse terrain rule
// as regions; venues pass through (the engine's MapVenue shape matches).
// Per-cell tier/enc have no meaning at town scale and are dropped.
export function dbTownsToEngine(towns: CampaignTown[]): Town[] {
  return towns.map((t) => {
    const terrain: TerrainCell[] = [];
    t.grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell.t !== 'plains') terrain.push({ pos: { x, y }, type: cell.t as TerrainType });
      })
    );
    return {
      id: t.id,
      name: t.name,
      ...(t.desc !== undefined ? { desc: t.desc } : {}),
      ...(t.onEnter !== undefined ? { onEnter: t.onEnter } : {}),
      ...(t.onFirstEnter !== undefined ? { onFirstEnter: t.onFirstEnter } : {}),
      ...(t.onExit !== undefined ? { onExit: t.onExit } : {}),
      ...(t.onFirstExit !== undefined ? { onFirstExit: t.onFirstExit } : {}),
      feetPerSquare: t.feetPerSquare,
      gridWidth: t.grid[0]?.length ?? 0,
      gridHeight: t.grid.length,
      ...(terrain.length > 0 ? { terrain } : {}),
      startPos: t.startPos,
      venues: (t.venues ?? []).map((v) => ({ ...v })),
      ...(t.floor !== undefined ? { floor: t.floor } : {}),
    };
  });
}

// ─── Rooms (relational storage — campaign_rooms) ─────────────────────────────

// One square of a room's dense cell grid. BOTH layers optional: `t` is the
// cosmetic terrain paint (absent = bare floor texture), `m` is the cell's
// mechanical flag — at most one per cell, covering the engine's sparse
// arrays (obstacles / difficultTerrain / climbTerrain / swimTerrain /
// coverPositions). Authored layer overlap (a cell that's both difficult
// AND cover) stays a code-room capability.
export type RoomCellMech = 'obstacle' | 'difficult' | 'climb' | 'swim' | 'cover';
export interface CampaignRoomCell {
  t?: string;
  m?: RoomCellMech;
}

export interface CampaignRoomExit {
  pos: GridPos;
  toRoomId?: string;
  entrancePos?: GridPos;
  label?: string;
  ascends?: boolean;
}

// An enemy placement: which bestiary template (by NAME — the composed
// ambient-catalog + customs identity) and how many. The overlay
// materializes these into full Enemy instances when the room folds in.
export interface CampaignRoomEnemy {
  name: string;
  count?: number; // default 1
}

// A loot placement: which item (by id — the composed loot-table identity)
// and optionally where on the room grid (a pos makes it a clickable token;
// without one it's a plain room pickup).
export interface CampaignRoomLoot {
  itemId: string;
  pos?: GridPos;
}

// A placed NPC — bespoke (no catalog): identity, social surface and an
// optional dialogue tree / shop / stat block. The stat block defaults to
// an SRD Commoner-style block at overlay time; dialogue consequences and
// faction wiring stay code-side for now.
export interface CampaignRoomNpcResponse {
  label: string;
  reply?: string;
  responses?: CampaignRoomNpcResponse[];
}
// A searchable / interactable object (chest, lever, shrine). Mirrors the
// engine's RoomObject; desc / interactText default at overlay time so the
// painter only requires a name. lootIds reference the composed loot table
// and resolve at INTERACT time (the engine skips unknown ids).
export interface CampaignRoomObject {
  id: string;
  name: string;
  desc?: string;
  interactText?: string;
  searchable?: boolean;
  searchDC?: number;
  lootIds?: string[];
  foundText?: string;
  emptyText?: string;
  pos?: GridPos;
}

// At most one trap per room (the engine's Trap shape). The mechanical
// fields are authored; the id/desc/narrative strings default at overlay
// time when left off.
export interface CampaignRoomTrap {
  id?: string;
  name: string;
  desc?: string;
  dc: number;
  damage: string;
  damageType: string;
  condition?: string;
  conditionDuration?: number;
  triggerNarrative?: string;
  detectNarrative?: string;
  disarmSuccess?: string;
  disarmFail?: string;
}

export interface CampaignRoomNpc {
  id: string; // campaign-unique — keys the campaign.npcs map
  name: string;
  attitude: 'friendly' | 'indifferent' | 'hostile';
  greeting: string;
  responses?: CampaignRoomNpcResponse[];
  persuasionDC?: number;
  pos?: GridPos;
  icon?: string;
  shop?: Array<{ itemId: string; price: number }>;
  hp?: number;
  ac?: number;
  damage?: string;
  toHit?: number;
  xp?: number;
}

export interface CampaignRoom {
  id: string;
  name: string;
  desc: string;
  // Level narration hooks (enter on every descend/passage into the room;
  // exit on leaving it — to another room or ascending).
  onEnter?: string;
  onFirstEnter?: string;
  onExit?: string;
  onFirstExit?: string;
  feetPerSquare?: number; // default 5 (SRD tactical scale)
  grid: CampaignRoomCell[][];
  entryPos: GridPos;
  exits?: CampaignRoomExit[];
  lighting?: 'bright' | 'dim' | 'dark' | 'sunlight';
  floor?: FloorType;
  canRest?: boolean;
  enemies?: CampaignRoomEnemy[];
  loot?: CampaignRoomLoot[];
  npcs?: CampaignRoomNpc[];
  objects?: CampaignRoomObject[];
  trap?: CampaignRoomTrap;
}

interface RoomRow {
  id: string;
  name: string;
  description: string;
  on_enter: string | null;
  on_first_enter: string | null;
  on_exit: string | null;
  on_first_exit: string | null;
  feet_per_square: number;
  grid: CampaignRoomCell[][];
  entry_x: number;
  entry_y: number;
  exits: CampaignRoomExit[];
  lighting: CampaignRoom['lighting'] | null;
  floor: FloorType | null;
  can_rest: boolean;
  enemies: CampaignRoomEnemy[];
  loot: CampaignRoomLoot[];
  npcs: CampaignRoomNpc[];
  objects: CampaignRoomObject[];
  trap: CampaignRoomTrap | null;
}

export async function getCampaignRooms(pool: Pool, campaignId: string): Promise<CampaignRoom[]> {
  const { rows } = await pool.query<RoomRow>(
    `SELECT id, name, description, feet_per_square, grid, entry_x, entry_y, exits,
            lighting, floor, can_rest, enemies, loot, npcs, objects, trap,
            on_enter, on_first_enter, on_exit, on_first_exit
       FROM campaign_rooms
      WHERE campaign_id = $1
      ORDER BY sort_order, id`,
    [campaignId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    desc: r.description,
    ...(r.on_enter !== null ? { onEnter: r.on_enter } : {}),
    ...(r.on_first_enter !== null ? { onFirstEnter: r.on_first_enter } : {}),
    ...(r.on_exit !== null ? { onExit: r.on_exit } : {}),
    ...(r.on_first_exit !== null ? { onFirstExit: r.on_first_exit } : {}),
    ...(r.feet_per_square !== 5 ? { feetPerSquare: r.feet_per_square } : {}),
    grid: r.grid,
    entryPos: { x: r.entry_x, y: r.entry_y },
    ...(r.exits.length > 0 ? { exits: r.exits } : {}),
    ...(r.lighting !== null ? { lighting: r.lighting } : {}),
    ...(r.floor !== null ? { floor: r.floor } : {}),
    ...(r.can_rest ? { canRest: true } : {}),
    ...(r.enemies.length > 0 ? { enemies: r.enemies } : {}),
    ...(r.loot.length > 0 ? { loot: r.loot } : {}),
    ...(r.npcs.length > 0 ? { npcs: r.npcs } : {}),
    ...(r.objects.length > 0 ? { objects: r.objects } : {}),
    ...(r.trap !== null ? { trap: r.trap } : {}),
  }));
}

// Replace-all write, matching the editor's whole-section semantics.
export async function putCampaignRooms(
  pool: Pool,
  campaignId: string,
  rooms: CampaignRoom[]
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('DELETE FROM campaign_rooms WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      await client.query(
        `INSERT INTO campaign_rooms
           (campaign_id, id, sort_order, name, description, feet_per_square,
            grid, entry_x, entry_y, exits, lighting, floor, can_rest, enemies, loot, npcs,
            on_enter, on_first_enter, on_exit, on_first_exit, objects, trap)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12, $13, $14::jsonb,
                 $15::jsonb, $16::jsonb, $17, $18, $19, $20, $21::jsonb, $22::jsonb)`,
        [
          campaignId,
          r.id,
          i,
          r.name,
          r.desc,
          r.feetPerSquare ?? 5,
          JSON.stringify(r.grid),
          r.entryPos.x,
          r.entryPos.y,
          JSON.stringify(r.exits ?? []),
          r.lighting ?? null,
          r.floor ?? null,
          r.canRest ?? false,
          JSON.stringify(r.enemies ?? []),
          JSON.stringify(r.loot ?? []),
          JSON.stringify(r.npcs ?? []),
          r.onEnter ?? null,
          r.onFirstEnter ?? null,
          r.onExit ?? null,
          r.onFirstExit ?? null,
          JSON.stringify(r.objects ?? []),
          r.trap ? JSON.stringify(r.trap) : null,
        ]
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCampaignRooms(pool: Pool, campaignId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_rooms WHERE campaign_id = $1', [campaignId]);
  return true;
}

// Convert DB rooms into the engine model: dims derive from the dense grid,
// cosmetic `t` paint becomes the sparse terrain array, and each cell's
// mechanical flag lands in the matching engine array. Exits pass through
// (the shapes match).
export function dbRoomsToEngine(rooms: CampaignRoom[]): Room[] {
  return rooms.map((r) => {
    const terrain: TerrainCell[] = [];
    const mech: Record<RoomCellMech, GridPos[]> = {
      obstacle: [],
      difficult: [],
      climb: [],
      swim: [],
      cover: [],
    };
    r.grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell.t) terrain.push({ pos: { x, y }, type: cell.t as TerrainType });
        if (cell.m) mech[cell.m].push({ x, y });
      })
    );
    return {
      id: r.id,
      name: r.name,
      desc: r.desc,
      ...(r.onEnter !== undefined ? { onEnter: r.onEnter } : {}),
      ...(r.onFirstEnter !== undefined ? { onFirstEnter: r.onFirstEnter } : {}),
      ...(r.onExit !== undefined ? { onExit: r.onExit } : {}),
      ...(r.onFirstExit !== undefined ? { onFirstExit: r.onFirstExit } : {}),
      gridWidth: r.grid[0]?.length ?? 0,
      gridHeight: r.grid.length,
      ...(r.feetPerSquare !== undefined ? { feetPerSquare: r.feetPerSquare } : {}),
      entryPos: r.entryPos,
      ...(r.exits && r.exits.length > 0
        ? { exits: r.exits.map((e) => ({ ...e }) as RoomExit) }
        : {}),
      ...(terrain.length > 0 ? { terrain } : {}),
      ...(mech.obstacle.length > 0 ? { obstacles: mech.obstacle } : {}),
      ...(mech.difficult.length > 0 ? { difficultTerrain: mech.difficult } : {}),
      ...(mech.climb.length > 0 ? { climbTerrain: mech.climb } : {}),
      ...(mech.swim.length > 0 ? { swimTerrain: mech.swim } : {}),
      ...(mech.cover.length > 0 ? { coverPositions: mech.cover } : {}),
      ...(r.lighting !== undefined ? { lighting: r.lighting } : {}),
      ...(r.floor !== undefined ? { floor: r.floor } : {}),
      // ALWAYS explicit for DB rooms. The engine's default is
      // allowed-unless-forbidden (canRest === false blocks), but the
      // painter's CAN REST HERE checkbox promises the opposite — an
      // unchecked room must actually forbid resting, so emit false.
      canRest: r.canRest ?? false,
      ...(r.objects && r.objects.length > 0
        ? {
            objects: r.objects.map((o) => ({
              ...o,
              desc: o.desc ?? '',
              interactText: o.interactText ?? `You examine the ${o.name}.`,
              // A chest is searchable by virtue of holding loot — authors
              // shouldn't need a separate flag for the common case.
              ...(o.searchable === undefined && (o.lootIds?.length ?? 0) > 0
                ? { searchable: true }
                : {}),
            })),
          }
        : {}),
      ...(r.trap
        ? {
            trap: {
              id: r.trap.id ?? `${r.id}-trap`,
              name: r.trap.name,
              desc: r.trap.desc ?? `A hidden ${r.trap.name.toLowerCase()}.`,
              dc: r.trap.dc,
              damage: r.trap.damage,
              damageType: r.trap.damageType,
              ...(r.trap.condition ? { condition: r.trap.condition as never } : {}),
              ...(r.trap.conditionDuration !== undefined
                ? { conditionDuration: r.trap.conditionDuration }
                : {}),
              // {name} = the triggering character, {dmg} = the rolled damage.
              triggerNarrative:
                r.trap.triggerNarrative ?? `{name} sets off the ${r.trap.name} — {dmg} damage!`,
              detectNarrative:
                r.trap.detectNarrative ?? `You spot the ${r.trap.name} before it springs.`,
              disarmSuccess: r.trap.disarmSuccess ?? `The ${r.trap.name} is disarmed.`,
              disarmFail: r.trap.disarmFail ?? `The attempt slips — the ${r.trap.name} fires!`,
            },
          }
        : {}),
    };
  });
}

// Convert DB regions (dense {t, tier?, enc?} grid + child sites) into the
// engine's map model (sparse terrain + tierZones rectangles):
//
//   - grid cells of any non-default type become sparse TerrainCells
//     (unlisted cells default to 'plains' in the engine — same default)
//   - per-cell `tier` overrides become 1x1 TierZone rectangles, which
//     `regionTierAt` already resolves (highest covering zone, else
//     baseTier) — painted tier bands of any shape Just Work
//   - the starting region sorts FIRST: initMapState opens the campaign at
//     campaign.regions[0]
//   - per-cell `enc` has no engine slot yet — encounters only roll where a
//     region has an encounterTable, which DB regions don't carry until the
//     entities cross-validation lands. Ignored (documented) for now.
export function dbRegionsToEngine(regions: CampaignRegion[]): Region[] {
  const ordered = [...regions].sort(
    (a, b) => Number(b.isStartingRegion) - Number(a.isStartingRegion)
  );
  return ordered.map((r) => {
    const terrain: TerrainCell[] = [];
    const tierZones: TierZone[] = [];
    r.grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell.t !== 'plains') terrain.push({ pos: { x, y }, type: cell.t as TerrainType });
        if (cell.tier !== undefined) {
          tierZones.push({ tier: cell.tier, from: { x, y }, to: { x, y } });
        }
      })
    );
    return {
      id: r.id,
      name: r.name,
      ...(r.desc !== undefined ? { desc: r.desc } : {}),
      ...(r.onEnter !== undefined ? { onEnter: r.onEnter } : {}),
      ...(r.onFirstEnter !== undefined ? { onFirstEnter: r.onFirstEnter } : {}),
      ...(r.onExit !== undefined ? { onExit: r.onExit } : {}),
      ...(r.onFirstExit !== undefined ? { onFirstExit: r.onFirstExit } : {}),
      feetPerSquare: r.feetPerSquare,
      gridWidth: r.grid[0]?.length ?? 0,
      gridHeight: r.grid.length,
      ...(terrain.length > 0 ? { terrain } : {}),
      startPos: r.startPos,
      sites: (r.sites ?? []).map((s) => ({ ...s })),
      ...(r.encounterChance !== undefined ? { encounterChance: r.encounterChance } : {}),
      ...(r.baseTier !== undefined ? { baseTier: r.baseTier } : {}),
      ...(tierZones.length > 0 ? { tierZones } : {}),
    };
  });
}

// ─── Section CRUD (the content-editing API's storage layer) ─────────────────

// The DB-authored data object for one campaign; null if the campaign row
// doesn't exist.
export async function getCampaignData(
  pool: Pool,
  campaignId: string
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query<{ data: Record<string, unknown> }>(
    'SELECT data FROM campaigns WHERE id = $1',
    [campaignId]
  );
  return rows[0]?.data ?? null;
}

// One section's DB-authored value, wherever it lives (JSONB key or its own
// table). `present: false` means the DB has no version — the section
// resolves from code (or nowhere).
export async function getDbSection(
  pool: Pool,
  campaignId: string,
  section: EditableSection
): Promise<{ present: boolean; value: unknown }> {
  if (section === 'regions') {
    const regions = await getCampaignRegions(pool, campaignId);
    return { present: regions.length > 0, value: regions.length > 0 ? regions : undefined };
  }
  if (section === 'towns') {
    const towns = await getCampaignTowns(pool, campaignId);
    return { present: towns.length > 0, value: towns.length > 0 ? towns : undefined };
  }
  if (section === 'rooms') {
    const rooms = await getCampaignRooms(pool, campaignId);
    return { present: rooms.length > 0, value: rooms.length > 0 ? rooms : undefined };
  }
  if (section === 'customItems') {
    const items = await getCampaignCustomItems(pool, campaignId);
    return { present: items.length > 0, value: items.length > 0 ? items : undefined };
  }
  if (section === 'customMonsters') {
    const templates = await getCampaignCustomMonsters(pool, campaignId);
    return { present: templates.length > 0, value: templates.length > 0 ? templates : undefined };
  }
  const data = await getCampaignData(pool, campaignId);
  const present = !!data && section in data;
  return { present, value: present ? data[section] : undefined };
}

// Write one section. Table-backed sections dispatch to their store; the
// rest land as keys in campaigns.data (parameterized jsonb_set keeps the
// write atomic per section). Section names are validated against
// EDITABLE_SECTIONS by the route before this runs.
export async function putCampaignSection(
  pool: Pool,
  campaignId: string,
  section: EditableSection,
  value: unknown
): Promise<boolean> {
  if (section === 'regions') {
    return putCampaignRegions(pool, campaignId, value as CampaignRegion[]);
  }
  if (section === 'towns') {
    return putCampaignTowns(pool, campaignId, value as CampaignTown[]);
  }
  if (section === 'rooms') {
    return putCampaignRooms(pool, campaignId, value as CampaignRoom[]);
  }
  if (section === 'customItems') {
    return putCampaignCustomItems(pool, campaignId, value as LootItem[]);
  }
  if (section === 'customMonsters') {
    return putCampaignCustomMonsters(pool, campaignId, value as EnemyTemplate[]);
  }
  const { rowCount } = await pool.query(
    `UPDATE campaigns
        SET data = jsonb_set(data, ARRAY[$2], $3::jsonb), updated_at = NOW()
      WHERE id = $1`,
    [campaignId, section, JSON.stringify(value)]
  );
  return (rowCount ?? 0) > 0;
}

// Remove a section's DB version — the campaign reverts to the code-defined
// version of that section on the next overlay refresh.
export async function deleteCampaignSection(
  pool: Pool,
  campaignId: string,
  section: EditableSection
): Promise<boolean> {
  if (section === 'regions') {
    return deleteCampaignRegions(pool, campaignId);
  }
  if (section === 'towns') {
    return deleteCampaignTowns(pool, campaignId);
  }
  if (section === 'rooms') {
    return deleteCampaignRooms(pool, campaignId);
  }
  if (section === 'customItems') {
    return deleteCampaignCustomItems(pool, campaignId);
  }
  if (section === 'customMonsters') {
    return deleteCampaignCustomMonsters(pool, campaignId);
  }
  const { rowCount } = await pool.query(
    `UPDATE campaigns SET data = data - $2, updated_at = NOW() WHERE id = $1`,
    [campaignId, section]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Code-customs fallback (editing convenience) ─────────────────────────────

// What the customs sections resolve to when the DB has no rows: the code
// campaign's own entries — the ones that aren't catalog entries (identity:
// item id / monster name). Gives editors the code customs as a starting
// point instead of an empty pane. Null when the code has none.
export async function getCustomsCodeFallback(
  pool: Pool,
  code: Context | undefined,
  section: 'customItems' | 'customMonsters'
): Promise<unknown[] | null> {
  if (!code) return null;
  if (section === 'customItems') {
    const catalogIds = new Set((await getItemCatalog(pool)).map((i) => i.id));
    const customs = (code.lootTable ?? []).filter((i) => !catalogIds.has(i.id));
    return customs.length > 0 ? customs : null;
  }
  const catalogNames = new Set((await getMonsterCatalog(pool)).map((m) => m.definition.name));
  const customs = (code.enemyTemplates ?? []).filter((t) => !catalogNames.has(t.name));
  return customs.length > 0 ? customs : null;
}

// ─── Overlay resolution (DB record first, code supplements) ──────────────────

// One campaign's full DB overlay: the JSONB sections, the table-backed
// ones, and the composed catalog-backed lists, as a single top-level-field
// map ready to merge. lootTable / enemyTemplates are ALWAYS composed —
// DB customs → code campaign entries → full catalog — so every campaign
// carries the whole SRD plus its own content.
async function loadOverlay(
  pool: Pool,
  campaignId: string,
  code: Context
): Promise<Record<string, unknown>> {
  const data = (await getCampaignData(pool, campaignId)) ?? {};
  const overlay: Record<string, unknown> =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data } : {};

  // The gameStart narration hook lives in campaigns.data but lands inside
  // the campaign block (it overlays campaign.intro — the game's first
  // narrative entry), not as a top-level Context field.
  const gameStart = typeof overlay.gameStart === 'string' ? overlay.gameStart : undefined;
  delete overlay.gameStart;

  // The composed catalogs come first — room enemy placements resolve
  // against the composed bestiary below.
  const lootTable = composeLootTable(
    await getCampaignCustomItems(pool, campaignId),
    code.lootTable ?? [],
    await getItemCatalog(pool)
  );
  if (lootTable.length > 0) overlay.lootTable = lootTable;

  const enemyTemplates = composeEnemyTemplates(
    await getCampaignCustomMonsters(pool, campaignId),
    code.enemyTemplates ?? [],
    (await getMonsterCatalog(pool)).map((m) => m.definition)
  );
  if (enemyTemplates.length > 0) overlay.enemyTemplates = enemyTemplates;

  // DB regions + towns + rooms DRIVE the map: converted to the engine model
  // and folded into the campaign block (each replacing its code/template
  // counterpart while the rest of the block — placed loot, quests — stays
  // code-supplied until those sections migrate).
  const dbRegions = await getCampaignRegions(pool, campaignId);
  const dbTowns = await getCampaignTowns(pool, campaignId);
  const dbRooms = await getCampaignRooms(pool, campaignId);
  if (dbRegions.length > 0 || dbTowns.length > 0 || dbRooms.length > 0 || gameStart !== undefined) {
    overlay.campaign = {
      ...(code.campaign ?? { world_name: code.id, intro: '', rooms: [] }),
      ...(gameStart !== undefined ? { intro: gameStart } : {}),
      ...(dbRegions.length > 0 ? { regions: dbRegionsToEngine(dbRegions) } : {}),
      ...(dbTowns.length > 0 ? { towns: dbTownsToEngine(dbTowns) } : {}),
      // Rooms-wholesale semantics extend to their enemies: DB rooms bring
      // their own placed-enemy map (possibly empty), replacing the code one
      // (whose room ids no longer resolve anyway).
      ...(dbRooms.length > 0
        ? {
            rooms: dbRoomsToEngine(dbRooms),
            enemies: materializeRoomEnemies(campaignId, dbRooms, enemyTemplates),
            loot: materializeRoomLoot(campaignId, dbRooms, lootTable),
            npcs: materializeRoomNpcs(campaignId, dbRooms, lootTable),
          }
        : {}),
    };
  }

  return overlay;
}

// Build the campaign.npcs map from each DB room's authored NPCs: the
// DB shape + the room id + an SRD Commoner-style stat-block default
// (AC 10, HP 4, club +2 1d4, 0 XP) wherever the author left stats off.
// Shop entries are filtered against the composed loot table (warn +
// drop unknown item ids) so the vendor flow never serves a dead item.
function materializeRoomNpcs(
  campaignId: string,
  rooms: CampaignRoom[],
  lootTable: LootItem[]
): Record<string, PlacedNpc> {
  const placed: Record<string, PlacedNpc> = {};
  for (const room of rooms) {
    for (const n of room.npcs ?? []) {
      const shop = (n.shop ?? []).filter((entry) => {
        if (lootTable.some((i) => i.id === entry.itemId)) return true;
        console.warn(
          `[campaignContent] ${campaignId}/${room.id}: NPC "${n.id}" sells unknown item "${entry.itemId}" — entry dropped`
        );
        return false;
      });
      placed[n.id] = {
        roomId: room.id,
        id: n.id,
        name: n.name,
        attitude: n.attitude,
        greeting: n.greeting,
        responses: (n.responses ?? []) as PlacedNpc['responses'],
        ...(n.persuasionDC !== undefined ? { persuasionDC: n.persuasionDC } : {}),
        ...(n.pos ? { pos: n.pos } : {}),
        ...(n.icon ? { icon: n.icon } : {}),
        ...(shop.length > 0 ? { shop } : {}),
        hp: n.hp ?? 4,
        ac: n.ac ?? 10,
        damage: n.damage ?? '1d4',
        toHit: n.toHit ?? 2,
        xp: n.xp ?? 0,
      };
    }
  }
  return placed;
}

// Expand each DB room's loot placements ({itemId, pos?}) into PlacedLoot
// entries (the full item + the placement pos) against the composed loot
// table. The per-placement key stays engine-derived (<roomId>#<index>).
// An unknown item id (deleted custom) is skipped with a warning.
function materializeRoomLoot(
  campaignId: string,
  rooms: CampaignRoom[],
  lootTable: LootItem[]
): Record<string, PlacedLoot[]> {
  const placed: Record<string, PlacedLoot[]> = {};
  for (const room of rooms) {
    const list: PlacedLoot[] = [];
    for (const p of room.loot ?? []) {
      const item = lootTable.find((i) => i.id === p.itemId);
      if (!item) {
        console.warn(
          `[campaignContent] ${campaignId}/${room.id}: no loot item with id "${p.itemId}" — placement skipped`
        );
        continue;
      }
      list.push({ ...item, ...(p.pos ? { pos: p.pos } : {}) });
    }
    if (list.length > 0) placed[room.id] = list;
  }
  return placed;
}

// Expand each DB room's placement specs ({name, count?}) into full Enemy
// instances against the composed bestiary — ids are <roomId>#<n> (the same
// convention code campaigns use), base HP from the template (party-size
// scaling stays a seed-time concern in procgen). A placement naming a
// template that no longer exists (a deleted custom) is skipped with a
// warning rather than failing the whole overlay.
function materializeRoomEnemies(
  campaignId: string,
  rooms: CampaignRoom[],
  templates: EnemyTemplate[]
): Record<string, Enemy[]> {
  const placed: Record<string, Enemy[]> = {};
  for (const room of rooms) {
    const list: Enemy[] = [];
    for (const p of room.enemies ?? []) {
      const tpl = templates.find((t) => t.name === p.name);
      if (!tpl) {
        console.warn(
          `[campaignContent] ${campaignId}/${room.id}: no enemy template named "${p.name}" — placement skipped`
        );
        continue;
      }
      for (let i = 0; i < (p.count ?? 1); i++) {
        list.push(materializeEnemy(tpl, `${room.id}#${list.length}`, tpl.hp));
      }
    }
    if (list.length > 0) placed[room.id] = list;
  }
  return placed;
}

// Overlay every registered campaign's DB content onto the loaded code
// contexts, in place (the CONTEXTS map is shared by reference across the
// route handlers). DB-born campaigns (no code context) resolve over the
// base template — that's what makes a freshly created campaign playable.
export async function applyCampaignOverlays(
  pool: Pool,
  contexts: Record<string, Context>
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM campaigns');
  for (const row of rows) {
    const hasCode = !!contexts[row.id];
    const code = contexts[row.id] ?? baseContextFor(row.id);
    const overlay = await loadOverlay(pool, row.id, code);
    if (Object.keys(overlay).length === 0 && hasCode) continue;
    contexts[row.id] = mergeContextWithOverlay(code, overlay);
    console.log(
      `[campaignContent] Resolved ${row.id} over ${hasCode ? 'code' : 'the base template'}: ${
        Object.keys(overlay).join(', ') || '(no DB sections)'
      }`
    );
  }
}

// Re-resolve one campaign after a content edit: merge its current DB
// overlay over the PRISTINE code context (never over an already-merged
// object — otherwise deleting a section couldn't restore the code version)
// and swap the result into the live map.
export async function refreshCampaignOverlay(
  pool: Pool,
  contexts: Record<string, Context>,
  codeContexts: Record<string, Context>,
  campaignId: string
): Promise<void> {
  // DB-born campaigns re-resolve over the base template.
  const code = codeContexts[campaignId] ?? baseContextFor(campaignId);
  const overlay = await loadOverlay(pool, campaignId, code);
  contexts[campaignId] = mergeContextWithOverlay(code, overlay);
}
