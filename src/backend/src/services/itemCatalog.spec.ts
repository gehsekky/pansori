// Item catalog + campaign loot tables against an in-memory fake of the
// items / campaign_items tables: startup sync upserts, the override
// decision on writes (catalog-identical → bare mapping; tweak/custom →
// override), ordered resolution, orphan skipping, and replace-all puts.

import {
  deleteCampaignLootTable,
  getCampaignLootTable,
  putCampaignLootTable,
  sameDefinition,
  syncItemCatalog,
} from './itemCatalog.js';
import { describe, expect, it, vi } from 'vitest';
import type { LootItem } from '../types.js';
import type { Pool } from 'pg';
import { SRD_ITEMS } from '../campaignData/srd/index.js';

function makeItemsDb(initial: { campaigns?: string[]; catalog?: Record<string, LootItem> }) {
  const campaigns = new Set(initial.campaigns ?? []);
  const catalog = new Map(Object.entries(initial.catalog ?? {}));
  // campaignId → [{item_id, sort_order, override}]
  const mappings = new Map<
    string,
    Array<{ item_id: string; sort_order: number; override: LootItem | null }>
  >();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT 1 FROM campaigns')) {
      const hit = campaigns.has(params[0] as string);
      return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO items')) {
      const [id, name, type, def] = params as [string, string, string, string];
      catalog.set(id, { ...(JSON.parse(def) as LootItem), name, type } as LootItem);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT id, definition FROM items')) {
      const ids = params[0] as string[];
      const rows = ids
        .filter((id) => catalog.has(id))
        .map((id) => ({ id, definition: catalog.get(id)! }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM campaign_items ci')) {
      const list = [...(mappings.get(params[0] as string) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      const rows = list.map((m) => ({
        item_id: m.item_id,
        override: m.override,
        definition: catalog.get(m.item_id) ?? null,
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('DELETE FROM campaign_items')) {
      mappings.delete(params[0] as string);
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO campaign_items')) {
      const [campaignId, itemId, sortOrder, override] = params as [
        string,
        string,
        number,
        string | null,
      ];
      const list = mappings.get(campaignId) ?? [];
      list.push({
        item_id: itemId,
        sort_order: sortOrder,
        override: override === null ? null : (JSON.parse(override) as LootItem),
      });
      mappings.set(campaignId, list);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake items db: unhandled query: ${sql.split('\n')[0]}`);
  });

  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
  return { pool, catalog, mappings };
}

const DAGGER = SRD_ITEMS.dagger;
const RELIC: LootItem = {
  id: 'sun-relic',
  name: 'Sun Relic',
  desc: 'A warm disc of unknown metal.',
  weight: 1,
  type: 'misc',
  slot: 'neck',
  damage: null,
  ac_bonus: null,
  heal: null,
  effect: null,
  aliases: ['relic'],
  requiresAttunement: true,
  wornEffects: [{ kind: 'save_bonus', ability: 'wis', bonus: 1 }],
};

describe('sameDefinition', () => {
  it('is key-order-insensitive and undefined-skipping', () => {
    expect(sameDefinition({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(sameDefinition({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameDefinition({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('syncItemCatalog', () => {
  it('upserts every SRD item', async () => {
    const db = makeItemsDb({});
    await syncItemCatalog(db.pool);
    expect(db.catalog.size).toBe(Object.keys(SRD_ITEMS).length);
    expect(db.catalog.get('dagger')?.name).toBe('Dagger');
  });
});

describe('putCampaignLootTable / getCampaignLootTable', () => {
  it('splits override vs mapping and round-trips in order', async () => {
    const db = makeItemsDb({ campaigns: ['malgovia'], catalog: { dagger: DAGGER } });
    const tweaked = { ...DAGGER, id: 'dagger', name: 'Ceremonial Dagger' };
    // Catalog-identical (key order shuffled) + custom item.
    const reordered = JSON.parse(JSON.stringify(DAGGER)) as LootItem;
    expect(await putCampaignLootTable(db.pool, 'malgovia', [reordered, RELIC])).toBe(true);
    const stored = db.mappings.get('malgovia')!;
    expect(stored[0]).toMatchObject({ item_id: 'dagger', override: null });
    expect(stored[1].override).toMatchObject({ id: 'sun-relic' });

    // A tweak of a catalog item stores its definition.
    expect(await putCampaignLootTable(db.pool, 'malgovia', [tweaked, RELIC])).toBe(true);
    expect(db.mappings.get('malgovia')![0].override).toMatchObject({ name: 'Ceremonial Dagger' });

    const back = await getCampaignLootTable(db.pool, 'malgovia');
    expect(back.map((i) => i.name)).toEqual(['Ceremonial Dagger', 'Sun Relic']);
  });

  it('bare mappings track the catalog definition', async () => {
    const db = makeItemsDb({ campaigns: ['malgovia'], catalog: { dagger: DAGGER } });
    await putCampaignLootTable(db.pool, 'malgovia', [DAGGER]);
    // Catalog updates (code change + re-sync) flow through to the campaign.
    db.catalog.set('dagger', { ...DAGGER, desc: 'sharper now' });
    const back = await getCampaignLootTable(db.pool, 'malgovia');
    expect(back[0].desc).toBe('sharper now');
  });

  it('skips orphaned mappings and rejects writes to missing campaigns', async () => {
    const db = makeItemsDb({ campaigns: ['malgovia'], catalog: { dagger: DAGGER } });
    await putCampaignLootTable(db.pool, 'malgovia', [DAGGER]);
    db.catalog.delete('dagger'); // catalog row removed from code
    expect(await getCampaignLootTable(db.pool, 'malgovia')).toEqual([]);
    expect(await putCampaignLootTable(db.pool, 'nope', [DAGGER])).toBe(false);
  });

  it('put is replace-all; delete empties the table for the campaign', async () => {
    const db = makeItemsDb({ campaigns: ['malgovia'], catalog: { dagger: DAGGER } });
    await putCampaignLootTable(db.pool, 'malgovia', [DAGGER, RELIC]);
    await putCampaignLootTable(db.pool, 'malgovia', [RELIC]);
    expect((await getCampaignLootTable(db.pool, 'malgovia')).map((i) => i.id)).toEqual([
      'sun-relic',
    ]);
    expect(await deleteCampaignLootTable(db.pool, 'malgovia')).toBe(true);
    expect(await getCampaignLootTable(db.pool, 'malgovia')).toEqual([]);
    expect(await deleteCampaignLootTable(db.pool, 'nope')).toBe(false);
  });
});
