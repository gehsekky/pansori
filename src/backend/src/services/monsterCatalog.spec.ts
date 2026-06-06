// Monster catalog + campaign enemy templates against an in-memory fake of
// the monsters / campaign_monsters tables. The distinguishing rule vs
// items: templates carry no ids, so catalog matching is by deep equality —
// identical → bare mapping (tracks code); rethemes/bosses → slug + override.

import {
  deleteCampaignEnemyTemplates,
  getCampaignEnemyTemplates,
  getMonsterCatalog,
  putCampaignEnemyTemplates,
  syncMonsterCatalog,
} from './monsterCatalog.js';
import { describe, expect, it, vi } from 'vitest';
import type { EnemyTemplate } from '../types.js';
import type { Pool } from 'pg';
import { SRD_MONSTERS } from '../campaignData/srd/index.js';

function makeMonstersDb(initial: {
  campaigns?: string[];
  catalog?: Record<string, EnemyTemplate>;
}) {
  const campaigns = new Set(initial.campaigns ?? []);
  const catalog = new Map(Object.entries(initial.catalog ?? {}));
  const mappings = new Map<
    string,
    Array<{ monster_id: string; sort_order: number; override: EnemyTemplate | null }>
  >();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT 1 FROM campaigns')) {
      const hit = campaigns.has(params[0] as string);
      return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO monsters')) {
      const [id, , , def] = params as [string, string, number, string];
      catalog.set(id, JSON.parse(def) as EnemyTemplate);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT id, definition FROM monsters')) {
      const rows = [...catalog.entries()].map(([id, definition]) => ({ id, definition }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM campaign_monsters cm')) {
      const list = [...(mappings.get(params[0] as string) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      const rows = list.map((m) => ({
        monster_id: m.monster_id,
        override: m.override,
        definition: catalog.get(m.monster_id) ?? null,
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('DELETE FROM campaign_monsters')) {
      mappings.delete(params[0] as string);
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO campaign_monsters')) {
      const [campaignId, monsterId, sortOrder, override] = params as [
        string,
        string,
        number,
        string | null,
      ];
      const list = mappings.get(campaignId) ?? [];
      list.push({
        monster_id: monsterId,
        sort_order: sortOrder,
        override: override === null ? null : (JSON.parse(override) as EnemyTemplate),
      });
      mappings.set(campaignId, list);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake monsters db: unhandled query: ${sql.split('\n')[0]}`);
  });

  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
  return { pool, catalog, mappings };
}

const BANDIT = SRD_MONSTERS.bandit;
const WOLF = SRD_MONSTERS.wolf;

describe('syncMonsterCatalog / getMonsterCatalog', () => {
  it('upserts every SRD monster under its registry key', async () => {
    const db = makeMonstersDb({});
    await syncMonsterCatalog(db.pool);
    expect(db.catalog.size).toBe(Object.keys(SRD_MONSTERS).length);
    expect(db.catalog.get('bandit')?.name).toBe('Bandit');
  });
});

describe('putCampaignEnemyTemplates / getCampaignEnemyTemplates', () => {
  it('exact catalog matches store as bare mappings; rethemes as slug overrides', async () => {
    const db = makeMonstersDb({ campaigns: ['malgovia'], catalog: { bandit: BANDIT, wolf: WOLF } });
    const frostWolf = { ...WOLF, name: 'Frost Wolf', resistances: ['cold'] };
    expect(await putCampaignEnemyTemplates(db.pool, 'malgovia', [BANDIT, frostWolf])).toBe(true);
    const stored = db.mappings.get('malgovia')!;
    expect(stored[0]).toMatchObject({ monster_id: 'bandit', override: null });
    expect(stored[1].monster_id).toBe('frost-wolf');
    expect(stored[1].override).toMatchObject({ name: 'Frost Wolf' });

    const back = await getCampaignEnemyTemplates(db.pool, 'malgovia');
    expect(back.map((t) => t.name)).toEqual(['Bandit', 'Frost Wolf']);
  });

  it('bare mappings track catalog updates; duplicates get suffixed ids with definitions', async () => {
    const db = makeMonstersDb({ campaigns: ['malgovia'], catalog: { bandit: BANDIT } });
    await putCampaignEnemyTemplates(db.pool, 'malgovia', [BANDIT, BANDIT]);
    const stored = db.mappings.get('malgovia')!;
    expect(stored[0]).toMatchObject({ monster_id: 'bandit', override: null });
    // The duplicate can't be a bare mapping under a different id.
    expect(stored[1].monster_id).toBe('bandit-2');
    expect(stored[1].override).toMatchObject({ name: 'Bandit' });
    // Catalog update flows through the bare mapping only.
    db.catalog.set('bandit', { ...BANDIT, hp: 99 });
    const back = await getCampaignEnemyTemplates(db.pool, 'malgovia');
    expect(back[0].hp).toBe(99);
    expect(back[1].hp).toBe(BANDIT.hp);
  });

  it('replace-all, delete, and missing-campaign behaviors', async () => {
    const db = makeMonstersDb({ campaigns: ['malgovia'], catalog: { bandit: BANDIT } });
    await putCampaignEnemyTemplates(db.pool, 'malgovia', [BANDIT, WOLF]);
    await putCampaignEnemyTemplates(db.pool, 'malgovia', [WOLF]);
    expect((await getCampaignEnemyTemplates(db.pool, 'malgovia')).map((t) => t.name)).toEqual([
      'Wolf',
    ]);
    expect(await deleteCampaignEnemyTemplates(db.pool, 'malgovia')).toBe(true);
    expect(await getCampaignEnemyTemplates(db.pool, 'malgovia')).toEqual([]);
    expect(await putCampaignEnemyTemplates(db.pool, 'nope', [BANDIT])).toBe(false);
    expect(await deleteCampaignEnemyTemplates(db.pool, 'nope')).toBe(false);
  });

  it('getMonsterCatalog returns id/definition pairs', async () => {
    const db = makeMonstersDb({ catalog: { bandit: BANDIT } });
    // The fake serves SELECT id, definition regardless of ORDER BY.
    const entries = await getMonsterCatalog(db.pool);
    expect(entries).toEqual([{ id: 'bandit', definition: BANDIT }]);
  });
});
