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
// import when game.ts loads the code contexts. When content-editing
// endpoints land they re-apply the overlay for the edited campaign.

import type { Context } from '../types.js';
import type { Pool } from 'pg';

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
