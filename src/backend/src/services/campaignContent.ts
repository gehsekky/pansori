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
  EncounterZone,
  Enemy,
  EnemyTemplate,
  Faction,
  FloorType,
  GridPos,
  LootItem,
  PlacedLoot,
  PlacedNpc,
  Quest,
  Region,
  Room,
  RoomExit,
  TerrainCell,
  TerrainType,
  Town,
} from '../types.js';
import type { Pool, PoolClient } from 'pg';
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
// 'terrainArt' is the campaign's tile skin (terrain type → tile choice —
// a TERRAIN_TILES id or { tile, tint } — plus `markers.town` for the
// regional town-site art): a campaigns.data key that overlays
// Context.terrainArt top-level and rides into the seed (procgen) so the
// FE map renders it.
//
// 'customItems' / 'customMonsters' are a campaign's OWN content on top of
// the ambient SRD catalogs (services/itemCatalog.ts / monsterCatalog.ts):
// every campaign automatically gets the full catalogs; customs add to them
// and shadow same-id (items) / same-name (monsters) catalog entries. The
// composed lootTable / enemyTemplates are LIVE engine fields.
// 'quests' / 'factions' are campaign-block script content stored as
// campaigns.data keys: loadOverlay folds them into campaign.quests /
// campaign.factions WHOLESALE (any DB quests replace the code quest list
// entirely, same for factions). Quest steps + dialogue gates share one
// condition vocabulary; quest ids are what dialogue start_quest
// consequences and quests_active/steps_done facts reference.
// 'worldName' folds into campaign.world_name (the prose world the seed
// carries); 'tagline' / 'previewArt' are picker presentation, overlaying
// the Context top level (served by GET /game/contexts).
export const EDITABLE_SECTIONS = [
  'gameStart',
  'worldName',
  'tagline',
  'previewArt',
  'narratives',
  'regions',
  'towns',
  'rooms',
  'quests',
  'factions',
  // Engine rules (Context.rules) — a plain top-level field, folded by the
  // generic overlay merge (gameEngine reads context.rules directly).
  'rules',
  'terrainArt',
  'customItems',
  'customMonsters',
  // Visual theme + creation config — plain top-level Context fields, so the
  // generic overlay merge folds them with no special handling.
  'theme',
  'backgrounds',
  'classSpells',
  'classStartingLoot',
  'classStartingEquipment',
  // Campaign-block field: the creation screen's party-size hint + auto-fill
  // composition. Folded into campaign.recommendedPartySize / Composition.
  'recommendedParty',
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
  kind: 'town' | 'local' | 'region';
  townId?: string;
  entryRoomId?: string;
  // kind 'region' — a GATE to another region; arrival at entryPos (else the
  // target's startPos).
  regionId?: string;
  entryPos?: { x: number; y: number };
  desc?: string;
  // Narration hook — fires every time the party lands on this site. A variant
  // pool (pick one); persisted as campaign_narratives rows ('regionSite').
  onEnter?: string | string[];
  icon?: string;
}

// One square of the dense terrain grid: `t` is the terrain type (behavior
// derives from the shared TERRAIN registry); `ez` (optional) tags the square
// into an encounter zone (a single id per cell ⇒ zones never overlap).
export interface CampaignRegionCell {
  t: string;
  ez?: string;
}

// An intra-region encounter zone as authored/stored (metadata only — the cell
// geometry lives on the grid via each cell's `ez` tag). Resolved into the engine
// `EncounterZone` (with materialized `cells`) by dbRegionsToEngine. The sole
// source of random encounters: tier + chance + table all live here.
export interface CampaignEncounterZone {
  id: string;
  name: string;
  tier: number;
  encounterChance: number;
  encounterTable?: string[];
}

export interface CampaignRegion {
  id: string;
  name: string;
  isStartingRegion: boolean;
  desc?: string;
  // Level narration hooks — each a variant pool (pick one), persisted as
  // campaign_narratives rows. FIRST overrides plain on the first occurrence;
  // region first-enter falls back to desc; region exits are dormant until
  // region travel exists.
  onEnter?: string | string[];
  onFirstEnter?: string | string[];
  onExit?: string | string[];
  onFirstExit?: string | string[];
  feetPerSquare: number;
  // Dense [y][x] terrain grid — dimensions derive from its shape
  // (validated rectangular at the API). Stored as a JSONB column.
  grid: CampaignRegionCell[][];
  startPos: { x: number; y: number };
  // Painted intra-region encounter zones (metadata; geometry on the grid `ez`).
  // The ONLY source of random encounters — the region carries no chance/table.
  encounterZones?: CampaignEncounterZone[];
  // Transition cells — stored in campaign_region_sites, authored inside
  // the region's JSON. Present only when the region has sites.
  sites?: CampaignRegionSite[];
}

// ── Narrative hooks (campaign_narratives) ────────────────────────────────────
// Every level/site narration hook is a VARIANT POOL persisted as rows: one row
// per variant, ordered by sort_order; the engine picks one at random
// (pickHookText). The section payloads still carry hooks inline (onEnter etc. as
// string | string[]) — these helpers just move the persistence to the table.
const LEVEL_HOOKS = ['onEnter', 'onFirstEnter', 'onExit', 'onFirstExit'] as const;

// Collapse a variant list to the wire shape: absent when empty, a lone string
// for one variant (keeps single-string round-trips stable), else the array.
function collapseHook(variants: string[] | undefined): string | string[] | undefined {
  if (!variants || variants.length === 0) return undefined;
  return variants.length === 1 ? variants[0] : variants;
}

export interface NarrativeLookup {
  get(ownerKind: string, ownerId: string, hook: string): string[] | undefined;
}

export async function getCampaignNarratives(
  pool: Pool,
  campaignId: string
): Promise<NarrativeLookup> {
  const { rows } = await pool.query<{
    owner_kind: string;
    owner_id: string;
    hook: string;
    text: string;
  }>(
    `SELECT owner_kind, owner_id, hook, text
       FROM campaign_narratives
      WHERE campaign_id = $1
      ORDER BY owner_kind, owner_id, hook, sort_order`,
    [campaignId]
  );
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const key = `${r.owner_kind} ${r.owner_id} ${r.hook}`;
    const list = m.get(key);
    if (list) list.push(r.text);
    else m.set(key, [r.text]);
  }
  return { get: (k, id, h) => m.get(`${k} ${id} ${h}`) };
}

// The four level hooks for an owner, collapsed to wire shape (absent ones omitted).
function levelHookFields(
  nar: NarrativeLookup,
  ownerKind: string,
  ownerId: string
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const hook of LEVEL_HOOKS) {
    const v = collapseHook(nar.get(ownerKind, ownerId, hook));
    if (v !== undefined) out[hook] = v;
  }
  return out;
}

// Insert a hook bundle as variant rows for one owner, inside a transaction.
// Accepts the wire shape (string | string[]); blanks are skipped.
async function insertNarratives(
  client: PoolClient,
  campaignId: string,
  ownerKind: string,
  ownerId: string,
  hooks: Record<string, string | string[] | undefined>
): Promise<void> {
  for (const [hook, val] of Object.entries(hooks)) {
    if (val === undefined) continue;
    const variants = (Array.isArray(val) ? val : [val]).filter((v) => v && v.trim());
    for (let k = 0; k < variants.length; k++) {
      await client.query(
        `INSERT INTO campaign_narratives (campaign_id, owner_kind, owner_id, hook, sort_order, text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [campaignId, ownerKind, ownerId, hook, k, variants[k]]
      );
    }
  }
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
  encounter_zones: CampaignEncounterZone[];
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
    ...((r.encounter_zones ?? []).length > 0 ? { encounterZones: r.encounter_zones } : {}),
  };
}

// Hooks now come from campaign_narratives (see getCampaignRegions); the legacy
// on_* columns stay inert.
const REGION_COLUMNS = `id, name, is_starting_region, description, feet_per_square,
       grid, start_x, start_y, encounter_zones`;

interface SiteRow {
  region_id: string;
  id: string;
  name: string;
  pos_x: number;
  pos_y: number;
  kind: 'town' | 'local' | 'region';
  town_id: string | null;
  entry_room_id: string | null;
  description: string | null;
  icon: string | null;
  target_region_id: string | null;
  entry_x: number | null;
  entry_y: number | null;
}

// `onEnter` is attached from campaign_narratives by the caller (needs the lookup).
function rowToSite(r: SiteRow): CampaignRegionSite {
  return {
    id: r.id,
    name: r.name,
    pos: { x: r.pos_x, y: r.pos_y },
    kind: r.kind,
    ...(r.town_id !== null ? { townId: r.town_id } : {}),
    ...(r.entry_room_id !== null ? { entryRoomId: r.entry_room_id } : {}),
    ...(r.target_region_id !== null ? { regionId: r.target_region_id } : {}),
    ...(r.entry_x !== null && r.entry_y !== null
      ? { entryPos: { x: r.entry_x, y: r.entry_y } }
      : {}),
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
    `SELECT region_id, id, name, pos_x, pos_y, kind, town_id, entry_room_id, description,
            icon, target_region_id, entry_x, entry_y
       FROM campaign_region_sites
      WHERE campaign_id = $1
      ORDER BY region_id, sort_order, id`,
    [campaignId]
  );
  const nar = await getCampaignNarratives(pool, campaignId);
  const sitesByRegion = new Map<string, CampaignRegionSite[]>();
  for (const row of siteRows) {
    const site = rowToSite(row);
    const onEnter = collapseHook(nar.get('regionSite', `${row.region_id}/${row.id}`, 'onEnter'));
    const list = sitesByRegion.get(row.region_id) ?? [];
    list.push(onEnter !== undefined ? { ...site, onEnter } : site);
    sitesByRegion.set(row.region_id, list);
  }
  return rows.map((r) => {
    const region = { ...rowToRegion(r), ...levelHookFields(nar, 'region', r.id) };
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
    // Replace-all: deleting the regions cascades their sites away too. Narrative
    // rows have no FK to the region rows (campaigns-only), so clear this
    // section's owners explicitly (scoped by owner_kind — don't touch towns/rooms).
    await client.query('DELETE FROM campaign_regions WHERE campaign_id = $1', [campaignId]);
    await client.query(
      `DELETE FROM campaign_narratives WHERE campaign_id = $1 AND owner_kind IN ('region', 'regionSite')`,
      [campaignId]
    );
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      await client.query(
        `INSERT INTO campaign_regions
           (campaign_id, id, sort_order, name, is_starting_region, description,
            on_enter, feet_per_square, grid, start_x, start_y, encounter_chance, base_tier,
            on_first_enter, on_exit, on_first_exit, encounter_table, encounter_zones)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16,
                 $17::jsonb, $18::jsonb)`,
        [
          campaignId,
          r.id,
          i,
          r.name,
          r.isStartingRegion,
          r.desc ?? null,
          // Narration hooks moved to campaign_narratives; the on_* TEXT columns
          // (and the retired encounter_chance / base_tier / encounter_table)
          // stay but are written inert — dropping them would break migration
          // 032's double-apply (CLAUDE.md's 015/020 lesson).
          null,
          r.feetPerSquare,
          JSON.stringify(r.grid),
          r.startPos.x,
          r.startPos.y,
          null,
          null,
          null,
          null,
          null,
          '[]',
          JSON.stringify(r.encounterZones ?? []),
        ]
      );
      await insertNarratives(client, campaignId, 'region', r.id, {
        onEnter: r.onEnter,
        onFirstEnter: r.onFirstEnter,
        onExit: r.onExit,
        onFirstExit: r.onFirstExit,
      });
      const sites = r.sites ?? [];
      for (let j = 0; j < sites.length; j++) {
        const s = sites[j];
        await client.query(
          `INSERT INTO campaign_region_sites
             (campaign_id, region_id, id, sort_order, name, pos_x, pos_y, kind,
              town_id, entry_room_id, description, on_enter, icon,
              target_region_id, entry_x, entry_y)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
            null, // on_enter moved to campaign_narratives (inert column)
            s.icon ?? null,
            s.regionId ?? null,
            s.entryPos?.x ?? null,
            s.entryPos?.y ?? null,
          ]
        );
        await insertNarratives(client, campaignId, 'regionSite', `${r.id}/${s.id}`, {
          onEnter: s.onEnter,
        });
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
  await pool.query(
    `DELETE FROM campaign_narratives WHERE campaign_id = $1 AND owner_kind IN ('region', 'regionSite')`,
    [campaignId]
  );
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
  // Level narration hooks — each a variant pool (pick one), persisted as
  // campaign_narratives rows. Enter via a region site; exit via the gate
  // (venue descents stay inside the town's scope).
  onEnter?: string | string[];
  onFirstEnter?: string | string[];
  onExit?: string | string[];
  onFirstExit?: string | string[];
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
  const nar = await getCampaignNarratives(pool, campaignId);
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
      ...levelHookFields(nar, 'town', r.id),
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
    await client.query(
      `DELETE FROM campaign_narratives WHERE campaign_id = $1 AND owner_kind = 'town'`,
      [campaignId]
    );
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
          // Narration hooks moved to campaign_narratives; on_* columns inert.
          null,
          null,
          null,
          null,
        ]
      );
      await insertNarratives(client, campaignId, 'town', t.id, {
        onEnter: t.onEnter,
        onFirstEnter: t.onFirstEnter,
        onExit: t.onExit,
        onFirstExit: t.onFirstExit,
      });
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
  await pool.query(
    `DELETE FROM campaign_narratives WHERE campaign_id = $1 AND owner_kind = 'town'`,
    [campaignId]
  );
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
  // An explicit enemy id for a single (count 1) placement — lets quest/rule
  // conditions target a specific creature (e.g. `enemies_killed contains
  // 'spire_ritual_apex#boss'`). Without it the materializer assigns the
  // positional `<roomId>#<index>` id. Ignored when count > 1.
  id?: string;
  // Per-placement death-drop overrides applied over the template at
  // materialize time (a room's elite drops specific coin/loot).
  goldDrop?: number;
  drops?: string[];
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
// an SRD Commoner-style block at overlay time. Dialogue nodes may be
// gated (condition / once — see dialogueGating) and may fire the safe
// consequence subset (set_flag / set_npc_attitude / give_gold / give_xp /
// give_item); the zod schema constrains the shapes, and the converter
// passes them through to the engine verbatim. Faction wiring stays
// code-side for now.
export interface CampaignRoomNpcResponse {
  label: string;
  reply?: string;
  condition?: object;
  once?: boolean;
  check?: Record<string, unknown>;
  consequences?: Array<Record<string, unknown>>;
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
  // Treat `name` as a proper noun in prose (no definite article) — set for
  // single-word personal names a heuristic can't catch (e.g. "Dusk").
  proper_noun?: boolean;
  attitude: 'friendly' | 'indifferent' | 'hostile';
  greeting: string;
  firstGreeting?: string;
  goodbye?: string;
  firstGoodbye?: string;
  responses?: CampaignRoomNpcResponse[];
  persuasionDC?: number;
  pos?: GridPos;
  icon?: string;
  shop?: Array<{ itemId: string; price: number; qty?: number }>;
  shopGold?: number;
  factionId?: string;
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
  // Level narration hooks — each a variant pool (pick one), persisted as
  // campaign_narratives rows (owner_kind 'room'). Multi-paragraph = newlines
  // within a variant.
  onEnter?: string | string[];
  onFirstEnter?: string | string[];
  onExit?: string | string[];
  onFirstExit?: string | string[];
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
    `SELECT id, name, description, grid, entry_x, entry_y, exits,
            lighting, floor, can_rest, enemies, loot, npcs, objects, trap
       FROM campaign_rooms
      WHERE campaign_id = $1
      ORDER BY sort_order, id`,
    [campaignId]
  );
  const nar = await getCampaignNarratives(pool, campaignId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    desc: r.description,
    ...levelHookFields(nar, 'room', r.id),
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
    await client.query(
      `DELETE FROM campaign_narratives WHERE campaign_id = $1 AND owner_kind = 'room'`,
      [campaignId]
    );
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      await client.query(
        `INSERT INTO campaign_rooms
           (campaign_id, id, sort_order, name, description,
            grid, entry_x, entry_y, exits, lighting, floor, can_rest, enemies, loot, npcs,
            on_enter, on_first_enter, on_exit, on_first_exit, objects, trap)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11, $12, $13::jsonb,
                 $14::jsonb, $15::jsonb, $16, $17, $18, $19, $20::jsonb, $21::jsonb)`,
        [
          campaignId,
          r.id,
          i,
          r.name,
          r.desc,
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
          // Narration hooks moved to campaign_narratives; on_* columns inert.
          null,
          null,
          null,
          null,
          JSON.stringify(r.objects ?? []),
          r.trap ? JSON.stringify(r.trap) : null,
        ]
      );
      await insertNarratives(client, campaignId, 'room', r.id, {
        onEnter: r.onEnter,
        onFirstEnter: r.onFirstEnter,
        onExit: r.onExit,
        onFirstExit: r.onFirstExit,
      });
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
  await pool.query(
    `DELETE FROM campaign_narratives WHERE campaign_id = $1 AND owner_kind = 'room'`,
    [campaignId]
  );
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

// Convert DB regions (dense {t, ez?} grid + child sites) into the engine's map
// model:
//
//   - grid cells of any non-default type become sparse TerrainCells
//     (unlisted cells default to 'plains' in the engine — same default)
//   - cells' `ez` tags materialize each encounter zone's `cells` (the sole
//     source of random encounters; the region carries no chance/table)
//   - the starting region sorts FIRST: initMapState opens the campaign at
//     campaign.regions[0]
export function dbRegionsToEngine(regions: CampaignRegion[]): Region[] {
  const ordered = [...regions].sort(
    (a, b) => Number(b.isStartingRegion) - Number(a.isStartingRegion)
  );
  return ordered.map((r) => {
    const terrain: TerrainCell[] = [];
    // Collect the painted cells of each encounter zone from the grid's `ez` tags.
    const zoneCells = new Map<string, GridPos[]>();
    r.grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell.t !== 'plains') terrain.push({ pos: { x, y }, type: cell.t as TerrainType });
        if (cell.ez) {
          const list = zoneCells.get(cell.ez);
          if (list) list.push({ x, y });
          else zoneCells.set(cell.ez, [{ x, y }]);
        }
      })
    );
    // Materialize each registered zone with its painted cells; drop zones that
    // ended up with no cells (deleted/empty paint) so the roll never picks them.
    const encounterZones: EncounterZone[] = (r.encounterZones ?? [])
      .map((z) => ({
        id: z.id,
        ...(z.name !== undefined ? { name: z.name } : {}),
        tier: z.tier,
        encounterChance: z.encounterChance,
        ...(z.encounterTable && z.encounterTable.length > 0
          ? { encounterTable: z.encounterTable }
          : {}),
        cells: zoneCells.get(z.id) ?? [],
      }))
      .filter((z) => z.cells.length > 0);
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
      ...(encounterZones.length > 0 ? { encounterZones } : {}),
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
  const worldName = typeof overlay.worldName === 'string' ? overlay.worldName : undefined;
  delete overlay.worldName;

  // recommendedParty {size, composition} folds into the campaign block's
  // recommendedPartySize + recommendedComposition (the character-creation
  // screen's party-size hint + auto-fill composition).
  const recParty =
    overlay.recommendedParty && typeof overlay.recommendedParty === 'object'
      ? (overlay.recommendedParty as { size?: number; composition?: string[] })
      : undefined;
  delete overlay.recommendedParty;

  // Quests + factions are campaign-block fields too — extracted here and
  // folded below (wholesale replace), never left as top-level keys.
  const dbQuests =
    Array.isArray(overlay.quests) && overlay.quests.length > 0
      ? (overlay.quests as Quest[])
      : undefined;
  delete overlay.quests;
  const dbFactions =
    Array.isArray(overlay.factions) && overlay.factions.length > 0
      ? (overlay.factions as Faction[])
      : undefined;
  delete overlay.factions;

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
  if (
    dbRegions.length > 0 ||
    dbTowns.length > 0 ||
    dbRooms.length > 0 ||
    gameStart !== undefined ||
    worldName !== undefined ||
    recParty !== undefined ||
    dbQuests !== undefined ||
    dbFactions !== undefined
  ) {
    overlay.campaign = {
      ...(code.campaign ?? { world_name: code.id, intro: '', rooms: [] }),
      ...(gameStart !== undefined ? { intro: gameStart } : {}),
      ...(worldName !== undefined ? { world_name: worldName } : {}),
      ...(typeof recParty?.size === 'number' ? { recommendedPartySize: recParty.size } : {}),
      ...(Array.isArray(recParty?.composition)
        ? { recommendedComposition: recParty.composition }
        : {}),
      ...(dbQuests !== undefined ? { quests: dbQuests } : {}),
      ...(dbFactions !== undefined ? { factions: dbFactions } : {}),
      ...(dbRegions.length > 0
        ? {
            regions: dbRegionsToEngine(
              filterEncounterTables(campaignId, dbRegions, enemyTemplates)
            ),
          }
        : {}),
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

// Filter each region's wilderness encounterTable against the composed
// bestiary — an unknown name (deleted custom) is dropped with a warning
// rather than rolling an encounter the engine can't materialize (the roll
// path also fails soft, but a warning at overlay is when the author can
// actually fix it).
function filterEncounterTables(
  campaignId: string,
  regions: CampaignRegion[],
  templates: EnemyTemplate[]
): CampaignRegion[] {
  const isKnown = (name: string) => templates.some((t) => t.name === name);
  const filterNames = (names: string[], where: string): string[] =>
    names.filter((name) => {
      if (isKnown(name)) return true;
      console.warn(
        `[campaignContent] ${campaignId}/${where}: no enemy template named "${name}" — encounter entry dropped`
      );
      return false;
    });
  return regions.map((r) => {
    // Each painted zone's creature table (the only encounter source).
    if (!r.encounterZones || r.encounterZones.length === 0) return r;
    let zonesChanged = false;
    const zones = r.encounterZones.map((z) => {
      if (!z.encounterTable || z.encounterTable.length === 0) return z;
      const kept = filterNames(z.encounterTable, `${r.id}/zone:${z.id}`);
      if (kept.length === z.encounterTable.length) return z;
      zonesChanged = true;
      return { ...z, encounterTable: kept };
    });
    return zonesChanged ? { ...r, encounterZones: zones } : r;
  });
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
        ...(n.proper_noun ? { proper_noun: n.proper_noun } : {}),
        attitude: n.attitude,
        greeting: n.greeting,
        ...(n.firstGreeting ? { firstGreeting: n.firstGreeting } : {}),
        ...(n.goodbye ? { goodbye: n.goodbye } : {}),
        ...(n.firstGoodbye ? { firstGoodbye: n.firstGoodbye } : {}),
        responses: (n.responses ?? []) as PlacedNpc['responses'],
        ...(n.persuasionDC !== undefined ? { persuasionDC: n.persuasionDC } : {}),
        ...(n.pos ? { pos: n.pos } : {}),
        ...(n.icon ? { icon: n.icon } : {}),
        ...(shop.length > 0 ? { shop } : {}),
        ...(n.shopGold !== undefined ? { shopGold: n.shopGold } : {}),
        ...(n.factionId ? { factionId: n.factionId } : {}),
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
      const count = p.count ?? 1;
      for (let i = 0; i < count; i++) {
        // A single placement may pin an explicit id (for quest/rule targeting);
        // otherwise fall back to the positional id.
        const id = count === 1 && p.id ? p.id : `${room.id}#${list.length}`;
        const e = materializeEnemy(tpl, id, tpl.hp);
        // Per-placement death-drop overrides win over the template's.
        if (p.goldDrop !== undefined) e.goldDrop = p.goldDrop;
        if (p.drops !== undefined) e.drops = p.drops;
        list.push(e);
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
