// Item catalog + per-campaign loot tables (the items/campaign_items pair).
//
// `items` is the global catalog, code-canonical: syncItemCatalog upserts
// every SRD_ITEMS entry at startup, so catalog rows always match the code
// registry (edit SRD items in code, not the DB). `campaign_items` is a
// campaign's loot table — which catalog items it offers, in order, with
// two kinds of `override`:
//   override = NULL       → serve the catalog definition (follows code updates)
//   override = LootItem   → serve this definition instead — either a tweak
//                           of a catalog item or a fully custom campaign
//                           item (id with no catalog row)
//
// putCampaignLootTable decides which form to store by comparing the posted
// definition against the catalog (key-order-insensitive): identical →
// mapping only, so the campaign keeps tracking the canonical item.

import type { LootItem } from '../types.js';
import type { Pool } from 'pg';
import { SRD_ITEMS } from '../campaignData/srd/index.js';

// Key-order-insensitive structural equality — editor JSON and code literals
// serialize keys in different orders.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sameDefinition(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

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

// A campaign's DB loot table, resolved to full definitions in authored
// order: override if present, else the catalog definition. Mappings whose
// id has neither (catalog row removed from code) are skipped with a warn.
export async function getCampaignLootTable(pool: Pool, campaignId: string): Promise<LootItem[]> {
  const { rows } = await pool.query<{
    item_id: string;
    override: LootItem | null;
    definition: LootItem | null;
  }>(
    `SELECT ci.item_id, ci.override, i.definition
       FROM campaign_items ci
       LEFT JOIN items i ON i.id = ci.item_id
      WHERE ci.campaign_id = $1
      ORDER BY ci.sort_order, ci.item_id`,
    [campaignId]
  );
  const out: LootItem[] = [];
  for (const row of rows) {
    const def = row.override ?? row.definition;
    if (!def) {
      console.warn(
        `[itemCatalog] ${campaignId}: mapping for "${row.item_id}" has no catalog row and no override — skipping`
      );
      continue;
    }
    out.push(def);
  }
  return out;
}

// Replace-all write, matching the editor's whole-section semantics. Posted
// items matching the catalog byte-for-byte (key-order aside) store as bare
// mappings; everything else stores its definition as the override.
export async function putCampaignLootTable(
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
    const ids = items.map((i) => i.id);
    const { rows: catalogRows } = await client.query<{ id: string; definition: LootItem }>(
      'SELECT id, definition FROM items WHERE id = ANY($1)',
      [ids]
    );
    const catalog = new Map(catalogRows.map((r) => [r.id, r.definition]));

    await client.query('DELETE FROM campaign_items WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const catalogDef = catalog.get(item.id);
      const override = catalogDef && sameDefinition(catalogDef, item) ? null : item;
      await client.query(
        `INSERT INTO campaign_items (campaign_id, item_id, sort_order, override)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [campaignId, item.id, i, override === null ? null : JSON.stringify(override)]
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

export async function deleteCampaignLootTable(pool: Pool, campaignId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [campaignId]);
  if (!rowCount) return false;
  await pool.query('DELETE FROM campaign_items WHERE campaign_id = $1', [campaignId]);
  return true;
}
