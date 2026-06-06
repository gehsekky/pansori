// Campaign registry sync. Campaigns are authored in code (campaignData/*)
// but authorization — owners/editors, and eventually DB-authored content —
// needs a DB anchor per campaign. On every backend boot, after migrations,
// upsert one `campaigns` row per discovered context so new campaign folders
// self-register and renames propagate.
//
// Deliberately additive: a row whose context disappears from code is NOT
// deleted — it may anchor membership rows (and later content tables), and a
// missing context is more likely a load failure than an intentional removal.

import type { Context } from '../types.js';
import type { Pool } from 'pg';

// Human-readable registry name for a context. Campaign-mode contexts carry a
// proper world name; fall back to the UI noun, then the id itself.
export function campaignDisplayName(ctx: Context): string {
  return ctx.campaign?.world_name ?? ctx.displayNoun ?? ctx.id;
}

export async function syncCampaignRegistry(
  pool: Pool,
  contexts: Record<string, Context>
): Promise<void> {
  const ids = Object.keys(contexts);
  for (const id of ids) {
    const name = campaignDisplayName(contexts[id]);
    // Code-authored campaigns are the built-ins — globally visible on first
    // registration. Visibility is deliberately NOT in the conflict update:
    // an admin demoting a campaign to private must survive restarts. Same
    // for an API rename (name_overridden) — the code name only propagates
    // until someone renames through the creator.
    await pool.query(
      `INSERT INTO campaigns (id, name, visibility)
       VALUES ($1, $2, 'global')
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, updated_at = NOW()
       WHERE campaigns.name_overridden = FALSE`,
      [id, name]
    );
  }
  console.log(`[campaignRegistry] Synced ${ids.length} campaign(s): ${ids.join(', ')}`);
}
