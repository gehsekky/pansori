// Item catalog (ambient) + per-campaign custom items: startup sync,
// customs CRUD, and the composition rule — DB customs → code campaign
// entries → full catalog, deduped by id with earlier-wins priority.

import {
  composeLootTable,
  deleteCampaignCustomItems,
  getCampaignCustomItems,
  putCampaignCustomItems,
  syncItemCatalog,
} from '../../src/services/itemCatalog.js';
import { describe, expect, it, vi } from 'vitest';
import type { LootItem } from '../../src/types.js';
import type { Pool } from 'pg';
import { SRD_ITEMS } from '../../src/campaignData/srd/index.js';

function makeItemsDb(initial: { campaigns?: string[] }) {
  const campaigns = new Set(initial.campaigns ?? []);
  const catalog = new Map<string, LootItem>();
  const customs = new Map<
    string,
    Array<{ item_id: string; sort_order: number; definition: LootItem }>
  >();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT 1 FROM campaigns')) {
      const hit = campaigns.has(params[0] as string);
      return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO items')) {
      const [id, , , def] = params as [string, string, string, string];
      catalog.set(id, JSON.parse(def) as LootItem);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM campaign_custom_items') && sql.includes('SELECT')) {
      const list = [...(customs.get(params[0] as string) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      return { rows: list.map((c) => ({ definition: c.definition })), rowCount: list.length };
    }
    if (sql.includes('DELETE FROM campaign_custom_items')) {
      customs.delete(params[0] as string);
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO campaign_custom_items')) {
      const [campaignId, itemId, sortOrder, def] = params as [string, string, number, string];
      const list = customs.get(campaignId) ?? [];
      list.push({ item_id: itemId, sort_order: sortOrder, definition: JSON.parse(def) });
      customs.set(campaignId, list);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake items db: unhandled query: ${sql.split('\n')[0]}`);
  });

  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
  return { pool, catalog, customs };
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

describe('syncItemCatalog', () => {
  it('upserts every SRD item', async () => {
    const db = makeItemsDb({});
    await syncItemCatalog(db.pool);
    expect(db.catalog.size).toBe(Object.keys(SRD_ITEMS).length);
    expect(db.catalog.get('dagger')?.name).toBe('Dagger');
  });
});

describe('campaign custom items CRUD', () => {
  it('round-trips customs in authored order; put is replace-all', async () => {
    const db = makeItemsDb({ campaigns: ['malgovia'] });
    expect(await putCampaignCustomItems(db.pool, 'malgovia', [RELIC, DAGGER])).toBe(true);
    expect((await getCampaignCustomItems(db.pool, 'malgovia')).map((i) => i.id)).toEqual([
      'sun-relic',
      'dagger',
    ]);
    await putCampaignCustomItems(db.pool, 'malgovia', [RELIC]);
    expect((await getCampaignCustomItems(db.pool, 'malgovia')).map((i) => i.id)).toEqual([
      'sun-relic',
    ]);
  });

  it('rejects writes to a missing campaign; delete clears the customs', async () => {
    const db = makeItemsDb({ campaigns: ['malgovia'] });
    expect(await putCampaignCustomItems(db.pool, 'nope', [RELIC])).toBe(false);
    await putCampaignCustomItems(db.pool, 'malgovia', [RELIC]);
    expect(await deleteCampaignCustomItems(db.pool, 'malgovia')).toBe(true);
    expect(await getCampaignCustomItems(db.pool, 'malgovia')).toEqual([]);
    expect(await deleteCampaignCustomItems(db.pool, 'nope')).toBe(false);
  });
});

describe('composeLootTable', () => {
  const codeCustom: LootItem = { ...RELIC, id: 'moonstone', name: 'Moonstone Amulet' };
  const codeDaggerTweak: LootItem = { ...DAGGER, name: 'Ceremonial Dagger' };

  it('customs shadow code entries, code entries shadow the catalog', () => {
    const dbDaggerTweak = { ...DAGGER, name: 'Sacrificial Dagger' };
    const composed = composeLootTable(
      [dbDaggerTweak],
      [codeDaggerTweak, codeCustom],
      [DAGGER, SRD_ITEMS.handaxe]
    );
    // One dagger: the DB custom wins over both the code tweak and catalog.
    expect(composed.filter((i) => i.id === 'dagger')).toEqual([dbDaggerTweak]);
    // Code-only custom survives; the rest of the catalog fills in.
    expect(composed.map((i) => i.id)).toEqual(['dagger', 'moonstone', 'handaxe']);
  });

  it('with no customs, every campaign gets code entries + the full catalog', () => {
    const composed = composeLootTable([], [codeCustom], [DAGGER, SRD_ITEMS.handaxe]);
    expect(composed.map((i) => i.id)).toEqual(['moonstone', 'dagger', 'handaxe']);
  });
});
