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

import type { Context, EnemyTemplate, LootItem } from '../types.js';
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

// The Context sections editable through the content API. Grows as zod
// schemas land per section (routes/schemas.ts CAMPAIGN_SECTION_SCHEMAS must
// stay in lockstep — there's a spec asserting that). Order is the display
// order in the admin UI.
//
// 'regions' is the first DB-era section with no code-context counterpart —
// stored relationally in campaign_regions. The engine doesn't read it
// yet — it still runs on campaign.regions (the 3-level grid model); the
// resolver will map this list in as the map content migrates to the DB.
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
export interface CampaignRegion {
  id: string;
  name: string;
  isStartingRegion: boolean;
  desc?: string;
  feetPerSquare: number;
  gridWidth: number;
  gridHeight: number;
  startPos: { x: number; y: number };
  encounterChance?: number;
  baseTier?: number;
}

interface RegionRow {
  id: string;
  name: string;
  is_starting_region: boolean;
  description: string | null;
  feet_per_square: number;
  grid_width: number;
  grid_height: number;
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
    gridWidth: r.grid_width,
    gridHeight: r.grid_height,
    startPos: { x: r.start_x, y: r.start_y },
    ...(r.encounter_chance !== null ? { encounterChance: r.encounter_chance } : {}),
    ...(r.base_tier !== null ? { baseTier: r.base_tier } : {}),
  };
}

const REGION_COLUMNS = `id, name, is_starting_region, description, feet_per_square,
       grid_width, grid_height, start_x, start_y, encounter_chance, base_tier`;

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
  return rows.map(rowToRegion);
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
    await client.query('DELETE FROM campaign_regions WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      await client.query(
        `INSERT INTO campaign_regions
           (campaign_id, id, sort_order, name, is_starting_region, description,
            feet_per_square, grid_width, grid_height, start_x, start_y,
            encounter_chance, base_tier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          campaignId,
          r.id,
          i,
          r.name,
          r.isStartingRegion,
          r.desc ?? null,
          r.feetPerSquare,
          r.gridWidth,
          r.gridHeight,
          r.startPos.x,
          r.startPos.y,
          r.encounterChance ?? null,
          r.baseTier ?? null,
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

export async function deleteCampaignRegions(pool: Pool, campaignId: string): Promise<boolean> {
  // Deleting zero rows is still success IF the campaign exists — reverting
  // an already-empty section is a no-op, not an error.
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_regions WHERE campaign_id = $1', [campaignId]);
  return true;
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
  const regions = await getCampaignRegions(pool, campaignId);
  if (regions.length > 0) overlay.regions = regions;

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
// route handlers). Campaigns with no DB content are untouched; DB rows
// without a code context are skipped — a DB-only campaign isn't playable
// until campaign creation lands with required-field validation.
export async function applyCampaignOverlays(
  pool: Pool,
  contexts: Record<string, Context>
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM campaigns');
  for (const row of rows) {
    const code = contexts[row.id];
    if (!code) {
      console.warn(`[campaignContent] DB campaign "${row.id}" has no code context — skipping`);
      continue;
    }
    const overlay = await loadOverlay(pool, row.id, code);
    if (Object.keys(overlay).length === 0) continue;
    contexts[row.id] = mergeContextWithOverlay(code, overlay);
    console.log(
      `[campaignContent] Applied DB overlay for ${row.id}: ${Object.keys(overlay).join(', ')}`
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
  const code = codeContexts[campaignId];
  if (!code) return; // DB-only campaign — nothing to serve until creation lands
  const overlay = await loadOverlay(pool, campaignId, code);
  contexts[campaignId] = mergeContextWithOverlay(code, overlay);
}
