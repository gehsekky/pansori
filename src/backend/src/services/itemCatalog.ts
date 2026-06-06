// Item catalog + per-campaign custom items.
//
// The catalog is AMBIENT: every campaign automatically gets the full SRD
// item list — the engine only ever looks items up by id (loot resolution,
// drops, quest rewards), never samples the pool, so unreferenced entries
// never surface in play. `items` is code-canonical: syncItemCatalog
// upserts every SRD_ITEMS entry at startup (edit SRD items in code, not
// the DB).
//
// `campaign_custom_items` is a campaign's own content: brand-new items
// AND tweaks — a custom sharing a catalog id shadows the catalog entry.
// The effective loot table composes as
//
//   DB customs → code campaign entries → full catalog   (dedup by id,
//                                                         earlier wins)
//
// so code campaigns' inline customs (Moonstone Amulet, …) keep working,
// and `lootTable.find(byId)` resolves the campaign's version first.

import type { LootItem } from '../types.js';
import type { Pool } from 'pg';
import { SRD_ITEMS } from '../campaignData/srd/index.js';

// Upsert the code catalog into the items table. Runs at startup after
// migrations (index.ts). Code wins for catalog rows — a drifted DB copy is
// brought back in line on every boot.
export async function syncItemCatalog(pool: Pool): Promise<void> {
  const entries = Object.values(SRD_ITEMS);
  for (const item of entries) {
    await pool.query(
      `INSERT INTO items (id, name, type, definition)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             type = EXCLUDED.type,
             definition = EXCLUDED.definition,
             updated_at = NOW()`,
      [item.id, item.name, item.type, JSON.stringify(item)]
    );
  }
  console.log(`[itemCatalog] Synced ${entries.length} catalog item(s)`);
}

// The full catalog, ordered for display (type groups, alphabetical within).
export async function getItemCatalog(pool: Pool): Promise<LootItem[]> {
  const { rows } = await pool.query<{ definition: LootItem }>(
    'SELECT definition FROM items ORDER BY type, name'
  );
  return rows.map((r) => r.definition);
}

// A campaign's custom items in authored order.
export async function getCampaignCustomItems(pool: Pool, campaignId: string): Promise<LootItem[]> {
  const { rows } = await pool.query<{ definition: LootItem }>(
    `SELECT definition
       FROM campaign_custom_items
      WHERE campaign_id = $1
      ORDER BY sort_order, item_id`,
    [campaignId]
  );
  return rows.map((r) => r.definition);
}

// Replace-all write, matching the editor's whole-section semantics.
export async function putCampaignCustomItems(
  pool: Pool,
  campaignId: string,
  items: LootItem[]
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('DELETE FROM campaign_custom_items WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < items.length; i++) {
      await client.query(
        `INSERT INTO campaign_custom_items (campaign_id, item_id, sort_order, definition)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [campaignId, items[i].id, i, JSON.stringify(items[i])]
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

export async function deleteCampaignCustomItems(pool: Pool, campaignId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_custom_items WHERE campaign_id = $1', [campaignId]);
  return true;
}

// Effective loot table: DB customs → code campaign entries → full catalog,
// deduped by id (earlier wins, preserving each source's internal order).
export function composeLootTable(
  customs: LootItem[],
  codeLootTable: LootItem[],
  catalog: LootItem[]
): LootItem[] {
  const seen = new Set<string>();
  const out: LootItem[] = [];
  for (const list of [customs, codeLootTable, catalog]) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
