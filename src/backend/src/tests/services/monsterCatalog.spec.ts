// Monster catalog (ambient) + per-campaign custom monsters: startup sync,
// customs CRUD (slug keys with duplicate suffixes), and the composition
// rule — DB customs → code campaign entries → full catalog, deduped by
// NAME with earlier-wins priority (EnemyTemplate has no id field).

import {
  composeEnemyTemplates,
  deleteCampaignCustomMonsters,
  getCampaignCustomMonsters,
  getMonsterCatalog,
  putCampaignCustomMonsters,
  syncMonsterCatalog,
} from '../../services/monsterCatalog.js';
import { describe, expect, it, vi } from 'vitest';
import type { EnemyTemplate } from '../../types.js';
import type { Pool } from 'pg';
import { SRD_MONSTERS } from '../../campaignData/srd/index.js';

function makeMonstersDb(initial: { campaigns?: string[] }) {
  const campaigns = new Set(initial.campaigns ?? []);
  const catalog = new Map<string, EnemyTemplate>();
  const customs = new Map<
    string,
    Array<{ monster_id: string; sort_order: number; definition: EnemyTemplate }>
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
    if (sql.includes('FROM campaign_custom_monsters') && sql.includes('SELECT')) {
      const list = [...(customs.get(params[0] as string) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      return { rows: list.map((c) => ({ definition: c.definition })), rowCount: list.length };
    }
    if (sql.includes('DELETE FROM campaign_custom_monsters')) {
      customs.delete(params[0] as string);
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('DELETE FROM monsters')) {
      // The sync prune: drop catalog rows whose id left SRD_MONSTERS.
      const keep = new Set(params[0] as string[]);
      let pruned = 0;
      for (const id of [...catalog.keys()])
        if (!keep.has(id)) {
          catalog.delete(id);
          pruned++;
        }
      return { rows: [], rowCount: pruned };
    }
    if (sql.includes('INSERT INTO campaign_custom_monsters')) {
      const [campaignId, monsterId, sortOrder, def] = params as [string, string, number, string];
      const list = customs.get(campaignId) ?? [];
      list.push({ monster_id: monsterId, sort_order: sortOrder, definition: JSON.parse(def) });
      customs.set(campaignId, list);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake monsters db: unhandled query: ${sql.split('\n')[0]}`);
  });

  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
  return { pool, catalog, customs };
}

const BANDIT = SRD_MONSTERS.bandit;
const WOLF = SRD_MONSTERS.wolf;
const FROST_WOLF: EnemyTemplate = { ...WOLF, name: 'Frost Wolf', resistances: ['cold'] };

describe('syncMonsterCatalog / getMonsterCatalog', () => {
  it('upserts every SRD monster under its registry key', async () => {
    const db = makeMonstersDb({});
    await syncMonsterCatalog(db.pool);
    expect(db.catalog.size).toBe(Object.keys(SRD_MONSTERS).length);
    expect(db.catalog.get('bandit')?.name).toBe('Bandit');
    const entries = await getMonsterCatalog(db.pool);
    expect(entries.length).toBe(db.catalog.size);
  });
});

describe('campaign custom monsters CRUD', () => {
  it('keys rows by name slugs, suffixing duplicates', async () => {
    const db = makeMonstersDb({ campaigns: ['malgovia'] });
    expect(await putCampaignCustomMonsters(db.pool, 'malgovia', [FROST_WOLF, FROST_WOLF])).toBe(
      true
    );
    const stored = db.customs.get('malgovia')!;
    expect(stored.map((s) => s.monster_id)).toEqual(['frost-wolf', 'frost-wolf-2']);
    expect((await getCampaignCustomMonsters(db.pool, 'malgovia')).map((t) => t.name)).toEqual([
      'Frost Wolf',
      'Frost Wolf',
    ]);
  });

  it('replace-all, delete, and missing-campaign behaviors', async () => {
    const db = makeMonstersDb({ campaigns: ['malgovia'] });
    await putCampaignCustomMonsters(db.pool, 'malgovia', [FROST_WOLF, BANDIT]);
    await putCampaignCustomMonsters(db.pool, 'malgovia', [FROST_WOLF]);
    expect((await getCampaignCustomMonsters(db.pool, 'malgovia')).map((t) => t.name)).toEqual([
      'Frost Wolf',
    ]);
    expect(await deleteCampaignCustomMonsters(db.pool, 'malgovia')).toBe(true);
    expect(await getCampaignCustomMonsters(db.pool, 'malgovia')).toEqual([]);
    expect(await putCampaignCustomMonsters(db.pool, 'nope', [BANDIT])).toBe(false);
    expect(await deleteCampaignCustomMonsters(db.pool, 'nope')).toBe(false);
  });
});

describe('composeEnemyTemplates', () => {
  it('dedupes by name: customs > code entries > catalog', () => {
    const dbWolf: EnemyTemplate = { ...WOLF, hp: 99 }; // same name 'Wolf' — shadows
    const codeRetheme: EnemyTemplate = { ...SRD_MONSTERS.skeleton, name: 'Skeleton Warrior' };
    const composed = composeEnemyTemplates(
      [dbWolf],
      [codeRetheme, { ...WOLF, hp: 50 }],
      [WOLF, BANDIT]
    );
    expect(composed.filter((t) => t.name === 'Wolf')).toEqual([dbWolf]);
    expect(composed.map((t) => t.name)).toEqual(['Wolf', 'Skeleton Warrior', 'Bandit']);
  });

  it('with no customs, code rethemes ride alongside the full catalog', () => {
    const codeRetheme: EnemyTemplate = { ...SRD_MONSTERS.skeleton, name: 'Skeleton Warrior' };
    const composed = composeEnemyTemplates([], [codeRetheme], [WOLF, BANDIT]);
    expect(composed.map((t) => t.name)).toEqual(['Skeleton Warrior', 'Wolf', 'Bandit']);
  });
});
