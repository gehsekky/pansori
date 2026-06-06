// DB-first campaign content resolution.
//
// A campaign's data starts with its DB record (`campaigns.data` — the
// DB-authored portion of a Context) and is supplemented by the code in
// campaignData/: any top-level Context field present in `data` wins;
// everything absent falls through to the code-defined context. This is the
// bridge for moving content into the database section by section — e.g.
// once narratives are DB-edited, `data.narratives` overrides the code
// narratives while enemyTemplates/lootTable/etc. keep coming from code.
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

import type { Context } from '../types.js';
import type { Pool } from 'pg';

// The Context sections editable through the content API. Grows as zod
// schemas land per section (routes/schemas.ts CAMPAIGN_SECTION_SCHEMAS must
// stay in lockstep — there's a spec asserting that). Order is the display
// order in the admin UI.
//
// 'regions' is the first DB-era section with no code-context counterpart:
// a deliberately simplified region list ({id, name, isStartingRegion})
// that campaigns define in the DB from day one. The engine doesn't read it
// yet — it still runs on campaign.regions (the 3-level grid model); the
// resolver will map this list in as the map content migrates to the DB.
export const EDITABLE_SECTIONS = ['displayNoun', 'narratives', 'regions'] as const;
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

// Overlay every registered campaign's DB data onto the loaded code
// contexts, in place (the CONTEXTS map is shared by reference across the
// route handlers). Campaigns with an empty `data` are untouched; DB rows
// without a code context are skipped — a DB-only campaign isn't playable
// until campaign creation lands with required-field validation.
export async function applyCampaignOverlays(
  pool: Pool,
  contexts: Record<string, Context>
): Promise<void> {
  const { rows } = await pool.query<{ id: string; data: Record<string, unknown> }>(
    `SELECT id, data FROM campaigns WHERE data <> '{}'::jsonb`
  );
  for (const row of rows) {
    const code = contexts[row.id];
    if (!code) {
      console.warn(`[campaignContent] DB data for unknown context "${row.id}" — skipping`);
      continue;
    }
    if (typeof row.data !== 'object' || row.data === null || Array.isArray(row.data)) {
      console.warn(`[campaignContent] Non-object data for "${row.id}" — skipping`);
      continue;
    }
    contexts[row.id] = mergeContextWithOverlay(code, row.data);
    console.log(
      `[campaignContent] Applied DB overlay for ${row.id}: ${Object.keys(row.data).join(', ')}`
    );
  }
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

// Write one section into campaigns.data. The section name is validated
// against EDITABLE_SECTIONS by the route before this runs; jsonb_set with a
// parameterized path keeps the write atomic per section.
export async function putCampaignSection(
  pool: Pool,
  campaignId: string,
  section: EditableSection,
  value: unknown
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE campaigns
        SET data = jsonb_set(data, ARRAY[$2], $3::jsonb), updated_at = NOW()
      WHERE id = $1`,
    [campaignId, section, JSON.stringify(value)]
  );
  return (rowCount ?? 0) > 0;
}

// Remove a section from campaigns.data — the campaign reverts to the
// code-defined version of that section on the next overlay refresh.
export async function deleteCampaignSection(
  pool: Pool,
  campaignId: string,
  section: EditableSection
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE campaigns SET data = data - $2, updated_at = NOW() WHERE id = $1`,
    [campaignId, section]
  );
  return (rowCount ?? 0) > 0;
}

// Re-resolve one campaign after a content edit: merge its current DB data
// over the PRISTINE code context (never over an already-merged object —
// otherwise deleting a section couldn't restore the code version) and swap
// the result into the live map.
export async function refreshCampaignOverlay(
  pool: Pool,
  contexts: Record<string, Context>,
  codeContexts: Record<string, Context>,
  campaignId: string
): Promise<void> {
  const code = codeContexts[campaignId];
  if (!code) return; // DB-only campaign — nothing to serve until creation lands
  const data = await getCampaignData(pool, campaignId);
  contexts[campaignId] = mergeContextWithOverlay(code, data ?? {});
}
