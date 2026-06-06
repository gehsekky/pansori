// DB-first context resolution — the merge rules that bridge DB-authored
// campaign content and the campaignData/ code folders: DB top-level fields
// win, code fills the rest, the merge is shallow (whole-section replace),
// protected fields and malformed overlays are ignored. Regions live in
// their own table (campaign_regions); everything else in campaigns.data.

import {
  type CampaignRegion,
  EDITABLE_SECTIONS,
  applyCampaignOverlays,
  deleteCampaignSection,
  getCampaignData,
  getCampaignRegions,
  getDbSection,
  isEditableSection,
  mergeContextWithOverlay,
  putCampaignSection,
  refreshCampaignOverlay,
} from './campaignContent.js';
import { SRD_ITEMS, SRD_MONSTERS } from '../campaignData/srd/index.js';
import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_SECTION_SCHEMAS } from '../routes/schemas.js';
import type { Context } from '../types.js';
import type { Pool } from 'pg';
import { context as malgovia } from '../campaignData/malgovia/index.js';

function codeCtx(partial: Partial<Context> & { id: string }): Context {
  return partial as Context;
}

// Stateful fake of the campaigns + campaign_regions tables. One dispatcher
// serves pool.query AND client.query (putCampaignRegions runs a
// transaction via pool.connect).
function makeContentDb(initial: {
  campaigns?: Record<string, unknown>;
  regions?: Record<string, unknown[][]>; // campaignId → rows as insert-param tuples (sans campaign_id)
}) {
  const campaigns = new Map(Object.entries(initial.campaigns ?? {}));
  // Stored as the insert params after campaign_id: [id, sort_order, name,
  // is_starting_region, description, feet_per_square, grid_width,
  // grid_height, start_x, start_y, encounter_chance, base_tier]
  const regions = new Map<string, unknown[][]>(Object.entries(initial.regions ?? {}));

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT 1 FROM campaigns')) {
      const hit = campaigns.has(params[0] as string);
      return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
    }
    if (sql.includes('SELECT data FROM campaigns')) {
      const data = campaigns.get(params[0] as string);
      return { rows: data !== undefined ? [{ data }] : [], rowCount: data !== undefined ? 1 : 0 };
    }
    if (sql.includes('SELECT id FROM campaigns')) {
      const rows = [...campaigns.keys()].map((id) => ({ id }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('jsonb_set')) {
      const data = campaigns.get(params[0] as string) as Record<string, unknown> | undefined;
      if (data) data[params[1] as string] = JSON.parse(params[2] as string);
      return { rows: [], rowCount: data ? 1 : 0 };
    }
    if (sql.includes('data - $2')) {
      const data = campaigns.get(params[0] as string) as Record<string, unknown> | undefined;
      if (data) delete data[params[1] as string];
      return { rows: [], rowCount: data ? 1 : 0 };
    }
    if (sql.includes('FROM campaign_regions') && sql.includes('SELECT')) {
      const list = [...(regions.get(params[0] as string) ?? [])].sort(
        (a, b) => (a[1] as number) - (b[1] as number)
      );
      const rows = list.map((p) => ({
        id: p[0],
        sort_order: p[1],
        name: p[2],
        is_starting_region: p[3],
        description: p[4],
        feet_per_square: p[5],
        grid_width: p[6],
        grid_height: p[7],
        start_x: p[8],
        start_y: p[9],
        encounter_chance: p[10],
        base_tier: p[11],
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM campaign_items') || sql.includes('FROM campaign_monsters')) {
      // Loot tables / bestiaries aren't exercised through this fake —
      // overlay tests just need the queries to resolve empty.
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('DELETE FROM campaign_regions')) {
      regions.delete(params[0] as string);
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO campaign_regions')) {
      const [campaignId, ...rest] = params;
      const list = regions.get(campaignId as string) ?? [];
      list.push(rest);
      regions.set(campaignId as string, list);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake content db: unhandled query: ${sql.split('\n')[0]}`);
  });

  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
  return { pool, campaigns, regions };
}

const REGION_A: CampaignRegion = {
  id: 'malgovia',
  name: 'Malgovia',
  isStartingRegion: true,
  desc: 'A mist-shrouded vale.',
  feetPerSquare: 5280,
  gridWidth: 12,
  gridHeight: 10,
  startPos: { x: 3, y: 4 },
  encounterChance: 0.15,
  baseTier: 1,
};

const REGION_B: CampaignRegion = {
  id: 'frost-reach',
  name: 'The Frost Reach',
  isStartingRegion: false,
  feetPerSquare: 5280,
  gridWidth: 8,
  gridHeight: 8,
  startPos: { x: 0, y: 0 },
};

describe('mergeContextWithOverlay', () => {
  const code = codeCtx({
    id: 'malgovia',
    displayNoun: 'vale',
    classHitDie: { fighter: 10 },
    narratives: { genericArrival: ['from code'] } as never,
  });

  it('DB fields win, code fills the rest', () => {
    const merged = mergeContextWithOverlay(code, {
      narratives: { genericArrival: ['from db'] },
    });
    expect((merged.narratives as { genericArrival: string[] }).genericArrival).toEqual(['from db']);
    // Untouched sections still come from code.
    expect(merged.classHitDie).toEqual({ fighter: 10 });
    expect(merged.displayNoun).toBe('vale');
  });

  it('replaces a section wholesale (shallow, not deep, merge)', () => {
    const merged = mergeContextWithOverlay(code, { classHitDie: { wizard: 6 } });
    expect(merged.classHitDie).toEqual({ wizard: 6 });
  });

  it('never overrides protected fields and skips null values', () => {
    const merged = mergeContextWithOverlay(code, { id: 'evil-rename', displayNoun: null });
    expect(merged.id).toBe('malgovia');
    expect(merged.displayNoun).toBe('vale');
  });

  it('does not mutate the code context', () => {
    mergeContextWithOverlay(code, { displayNoun: 'changed' });
    expect(code.displayNoun).toBe('vale');
  });
});

describe('editable sections registry', () => {
  it('stays in lockstep with the per-section schemas', () => {
    expect([...EDITABLE_SECTIONS].sort()).toEqual(Object.keys(CAMPAIGN_SECTION_SCHEMAS).sort());
    expect(isEditableSection('narratives')).toBe(true);
    expect(isEditableSection('enemyTemplates')).toBe(true);
    expect(isEditableSection('spellTable')).toBe(false);
  });

  it('narratives schema accepts the real malgovia narratives', () => {
    // Regression guard: if the Context narratives shape grows a field the
    // schema doesn't know, a GET→PUT round trip in the editor would 400.
    const result = CAMPAIGN_SECTION_SCHEMAS.narratives.safeParse(malgovia.narratives);
    expect(result.success, JSON.stringify(result.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('lootTable schema accepts every SRD catalog item and the real malgovia loot table', () => {
    // The whole catalog must round-trip — this is what the editor serves.
    const catalog = CAMPAIGN_SECTION_SCHEMAS.lootTable.safeParse(Object.values(SRD_ITEMS));
    expect(catalog.success, JSON.stringify(catalog.error?.issues?.slice(0, 3))).toBe(true);
    const loot = CAMPAIGN_SECTION_SCHEMAS.lootTable.safeParse(malgovia.lootTable);
    expect(loot.success, JSON.stringify(loot.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('enemyTemplates schema accepts the whole SRD bestiary and the real malgovia templates', () => {
    const bestiary = CAMPAIGN_SECTION_SCHEMAS.enemyTemplates.safeParse(Object.values(SRD_MONSTERS));
    expect(bestiary.success, JSON.stringify(bestiary.error?.issues?.slice(0, 3))).toBe(true);
    const campaign = CAMPAIGN_SECTION_SCHEMAS.enemyTemplates.safeParse(malgovia.enemyTemplates);
    expect(campaign.success, JSON.stringify(campaign.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('enemyTemplates schema rejects duplicates, unknown fields, and bad nested shapes', () => {
    const schema = CAMPAIGN_SECTION_SCHEMAS.enemyTemplates;
    const bandit = SRD_MONSTERS.bandit;
    expect(schema.safeParse([bandit, bandit]).success).toBe(false); // dup name
    expect(schema.safeParse([{ ...bandit, sneer: true }]).success).toBe(false); // unknown field
    expect(schema.safeParse([{ ...bandit, onHitEffect: { condition: 'sleepy' } }]).success).toBe(
      false
    ); // unknown condition
    expect(
      schema.safeParse([
        {
          ...bandit,
          phases: [{ hpPct: 0.5, name: 'P', narrative: 'x', effects: [{ kind: 'explode' }] }],
        },
      ]).success
    ).toBe(false); // unknown phase effect kind
    expect(schema.safeParse([]).success).toBe(false);
  });

  it('lootTable schema rejects duplicates, unknown fields, and off-enum values', () => {
    const loot = CAMPAIGN_SECTION_SCHEMAS.lootTable;
    const dagger = SRD_ITEMS.dagger;
    expect(loot.safeParse([dagger, dagger]).success).toBe(false);
    expect(loot.safeParse([{ ...dagger, zappiness: 9 }]).success).toBe(false);
    expect(loot.safeParse([{ ...dagger, mastery: 'explode' }]).success).toBe(false);
    expect(loot.safeParse([{ ...dagger, slot: 'belt' }]).success).toBe(false);
    expect(
      loot.safeParse([{ ...dagger, wornEffects: [{ kind: 'fly_speed', feet: 30 }] }]).success
    ).toBe(false);
    expect(loot.safeParse([]).success).toBe(false);
  });

  it('narratives schema rejects off-shape values', () => {
    expect(CAMPAIGN_SECTION_SCHEMAS.narratives.safeParse({ genericArrival: 'nope' }).success).toBe(
      false
    );
    expect(CAMPAIGN_SECTION_SCHEMAS.displayNoun.safeParse('').success).toBe(false);
    expect(CAMPAIGN_SECTION_SCHEMAS.displayNoun.safeParse('marsh').success).toBe(true);
  });

  // A minimal valid region — tests tweak single fields off this base.
  const region = (over: Record<string, unknown> = {}) => ({
    id: 'malgovia',
    name: 'Malgovia',
    isStartingRegion: true,
    feetPerSquare: 5280,
    gridWidth: 12,
    gridHeight: 10,
    startPos: { x: 3, y: 4 },
    ...over,
  });

  it('regions schema accepts a valid list with exactly one starting region', () => {
    const result = CAMPAIGN_SECTION_SCHEMAS.regions.safeParse([
      region({ desc: 'A mist-shrouded vale.', encounterChance: 0.15, baseTier: 1 }),
      region({ id: 'frost-reach', name: 'The Frost Reach', isStartingRegion: false }),
    ]);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('regions schema requires scale, canvas, and startPos', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    for (const missing of ['feetPerSquare', 'gridWidth', 'gridHeight', 'startPos']) {
      const r = region();
      delete (r as Record<string, unknown>)[missing];
      expect(regions.safeParse([r]).success, `missing ${missing} should fail`).toBe(false);
    }
  });

  it('regions schema bounds-checks startPos against the grid', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    expect(regions.safeParse([region({ startPos: { x: 12, y: 0 } })]).success).toBe(false); // x == gridWidth
    expect(regions.safeParse([region({ startPos: { x: 0, y: 10 } })]).success).toBe(false); // y == gridHeight
    expect(regions.safeParse([region({ startPos: { x: 11, y: 9 } })]).success).toBe(true); // corner ok
  });

  it('regions schema rejects duplicate ids, bad slugs, and wrong start counts', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    expect(
      regions.safeParse([region(), region({ name: 'B', isStartingRegion: false })]).success
    ).toBe(false);
    expect(regions.safeParse([region({ id: 'Malgovia!' })]).success).toBe(false);
    expect(regions.safeParse([region({ isStartingRegion: false })]).success).toBe(false);
    expect(regions.safeParse([region(), region({ id: 'b' })]).success).toBe(false);
    expect(regions.safeParse([]).success).toBe(false);
    expect(regions.safeParse([region({ biome: 'swamp' })]).success).toBe(false);
    expect(regions.safeParse([region({ encounterChance: 1.5 })]).success).toBe(false);
    expect(regions.safeParse([region({ baseTier: 9 })]).success).toBe(false);
  });
});

describe('regions table store', () => {
  it('round-trips the JSON shape through rows, preserving order + optionals', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect(await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A, REGION_B])).toBe(
      true
    );
    const back = await getCampaignRegions(db.pool, 'malgovia');
    expect(back).toEqual([REGION_A, REGION_B]);
    // Optional fields absent (not null) on the lean region.
    expect('desc' in back[1]).toBe(false);
    expect('encounterChance' in back[1]).toBe(false);
  });

  it('put is replace-all, not append', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A, REGION_B]);
    await putCampaignSection(db.pool, 'malgovia', 'regions', [
      { ...REGION_B, isStartingRegion: true },
    ]);
    const back = await getCampaignRegions(db.pool, 'malgovia');
    expect(back.map((r) => r.id)).toEqual(['frost-reach']);
  });

  it('rejects writes to a missing campaign; delete reverts to empty', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect(await putCampaignSection(db.pool, 'nope', 'regions', [REGION_A])).toBe(false);
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    expect(await deleteCampaignSection(db.pool, 'malgovia', 'regions')).toBe(true);
    expect(await getCampaignRegions(db.pool, 'malgovia')).toEqual([]);
    expect(await deleteCampaignSection(db.pool, 'nope', 'regions')).toBe(false);
  });

  it('getDbSection reports presence from the table, not the JSONB', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect((await getDbSection(db.pool, 'malgovia', 'regions')).present).toBe(false);
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    const after = await getDbSection(db.pool, 'malgovia', 'regions');
    expect(after.present).toBe(true);
    expect(after.value).toEqual([REGION_A]);
  });
});

describe('section CRUD + live refresh', () => {
  it('put → refresh serves the DB version; delete → refresh restores code', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({ id: 'malgovia', displayNoun: 'vale' });
    const contexts: Record<string, Context> = { malgovia: code };
    const codeContexts: Record<string, Context> = { malgovia: code };

    expect(await putCampaignSection(db.pool, 'malgovia', 'displayNoun', 'marsh')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, codeContexts, 'malgovia');
    expect(contexts.malgovia.displayNoun).toBe('marsh');

    expect(await deleteCampaignSection(db.pool, 'malgovia', 'displayNoun')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, codeContexts, 'malgovia');
    expect(contexts.malgovia.displayNoun).toBe('vale');
  });

  it('refresh folds table regions into the live context', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({ id: 'malgovia', displayNoun: 'vale' });
    const contexts: Record<string, Context> = { malgovia: code };
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect((contexts.malgovia as unknown as { regions: CampaignRegion[] }).regions).toEqual([
      REGION_A,
    ]);
  });

  it('reports a missing campaign and reads back stored data', async () => {
    const db = makeContentDb({ campaigns: { malgovia: { displayNoun: 'marsh' } } });
    expect(await getCampaignData(db.pool, 'malgovia')).toEqual({ displayNoun: 'marsh' });
    expect(await getCampaignData(db.pool, 'nope')).toBeNull();
    expect(await putCampaignSection(db.pool, 'nope', 'displayNoun', 'x')).toBe(false);
    expect(await deleteCampaignSection(db.pool, 'nope', 'displayNoun')).toBe(false);
  });

  it('refresh is a no-op for DB-only campaigns (no code context)', async () => {
    const db = makeContentDb({ campaigns: { ghost: { displayNoun: 'boo' } } });
    const contexts: Record<string, Context> = {};
    await refreshCampaignOverlay(db.pool, contexts, {}, 'ghost');
    expect(Object.keys(contexts)).toEqual([]);
  });
});

describe('applyCampaignOverlays', () => {
  it('replaces matching contexts in place (JSONB + table regions) and skips unknown rows', async () => {
    const contexts: Record<string, Context> = {
      malgovia: codeCtx({ id: 'malgovia', displayNoun: 'vale' }),
      sandbox: codeCtx({ id: 'sandbox', displayNoun: 'sandbox' }),
    };
    const db = makeContentDb({
      campaigns: {
        malgovia: { displayNoun: 'db-vale' },
        sandbox: {},
        ghost: { displayNoun: 'nope' }, // no code context
      },
    });
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    await applyCampaignOverlays(db.pool, contexts);
    expect(contexts.malgovia.displayNoun).toBe('db-vale');
    expect((contexts.malgovia as unknown as { regions: CampaignRegion[] }).regions).toEqual([
      REGION_A,
    ]);
    expect(contexts.sandbox.displayNoun).toBe('sandbox');
    expect(Object.keys(contexts).sort()).toEqual(['malgovia', 'sandbox']);
  });
});
