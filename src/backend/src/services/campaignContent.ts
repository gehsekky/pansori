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
  EnemyTemplate,
  FloorType,
  LootItem,
  Region,
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
// 'regions' / 'towns' are DB-era sections with no code-context counterpart
// — stored relationally in campaign_regions / campaign_towns. They're LIVE:
// loadOverlay converts them (dbRegionsToEngine / dbTownsToEngine) and folds
// them into campaign.regions / campaign.towns, replacing the code maps.
//
// 'customItems' / 'customMonsters' are a campaign's OWN content on top of
// the ambient SRD catalogs (services/itemCatalog.ts / monsterCatalog.ts):
// every campaign automatically gets the full catalogs; customs add to them
// and shadow same-id (items) / same-name (monsters) catalog entries. The
// composed lootTable / enemyTemplates are LIVE engine fields.
export const EDITABLE_SECTIONS = [
  'displayNoun',
  'narratives',
  'regions',
  'towns',
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
    feetPerSquare: r.feet_per_square,
    grid: r.grid,
    startPos: { x: r.start_x, y: r.start_y },
    ...(r.encounter_chance !== null ? { encounterChance: r.encounter_chance } : {}),
    ...(r.base_tier !== null ? { baseTier: r.base_tier } : {}),
  };
}

const REGION_COLUMNS = `id, name, is_starting_region, description, feet_per_square,
       grid, start_x, start_y, encounter_chance, base_tier`;

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
    `SELECT region_id, id, name, pos_x, pos_y, kind, town_id, entry_room_id, description, icon
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
            feet_per_square, grid, start_x, start_y, encounter_chance, base_tier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)`,
        [
          campaignId,
          r.id,
          i,
          r.name,
          r.isStartingRegion,
          r.desc ?? null,
          r.feetPerSquare,
          JSON.stringify(r.grid),
          r.startPos.x,
          r.startPos.y,
          r.encounterChance ?? null,
          r.baseTier ?? null,
        ]
      );
      const sites = r.sites ?? [];
      for (let j = 0; j < sites.length; j++) {
        const s = sites[j];
        await client.query(
          `INSERT INTO campaign_region_sites
             (campaign_id, region_id, id, sort_order, name, pos_x, pos_y, kind,
              town_id, entry_room_id, description, icon)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
    `SELECT id, name, description, feet_per_square, grid, start_x, start_y, floor
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
            grid, start_x, start_y, floor)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
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

  // DB regions + towns DRIVE the map: converted to the engine model and
  // folded into the campaign block (each replacing its code/template
  // counterpart while the rest of the block — rooms, placed enemies/loot,
  // quests — stays code-supplied until those sections migrate).
  const dbRegions = await getCampaignRegions(pool, campaignId);
  const dbTowns = await getCampaignTowns(pool, campaignId);
  if (dbRegions.length > 0 || dbTowns.length > 0) {
    overlay.campaign = {
      ...(code.campaign ?? { world_name: code.id, intro: '', rooms: [] }),
      ...(dbRegions.length > 0 ? { regions: dbRegionsToEngine(dbRegions) } : {}),
      ...(dbTowns.length > 0 ? { towns: dbTownsToEngine(dbTowns) } : {}),
    };
  }

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

  return overlay;
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
