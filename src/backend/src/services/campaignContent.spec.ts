// DB-first context resolution — the merge rules that bridge DB-authored
// campaign content and the campaignData/ code folders: DB top-level fields
// win, code fills the rest, the merge is shallow (whole-section replace),
// protected fields and malformed overlays are ignored.

import {
  EDITABLE_SECTIONS,
  applyCampaignOverlays,
  deleteCampaignSection,
  getCampaignData,
  isEditableSection,
  mergeContextWithOverlay,
  putCampaignSection,
  refreshCampaignOverlay,
} from './campaignContent.js';
import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_SECTION_SCHEMAS } from '../routes/schemas.js';
import type { Context } from '../types.js';
import type { Pool } from 'pg';
import { context as malgovia } from '../campaignData/malgovia/index.js';

function codeCtx(partial: Partial<Context> & { id: string }): Context {
  return partial as Context;
}

function makePool(rows: Array<{ id: string; data: unknown }>) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  } as unknown as Pool;
}

// Stateful fake of the campaigns table for the section-CRUD round trip:
// SELECT data / jsonb_set write / `data - key` delete.
function makeContentDb(initial: Record<string, Record<string, unknown>>) {
  const table = new Map(Object.entries(initial));
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const id = params[0] as string;
      if (sql.includes('SELECT data FROM campaigns')) {
        const data = table.get(id);
        return { rows: data ? [{ data }] : [], rowCount: data ? 1 : 0 };
      }
      if (sql.includes('jsonb_set')) {
        const data = table.get(id);
        if (data) data[params[1] as string] = JSON.parse(params[2] as string);
        return { rows: [], rowCount: data ? 1 : 0 };
      }
      if (sql.includes('data - $2')) {
        const data = table.get(id);
        if (data) delete data[params[1] as string];
        return { rows: [], rowCount: data ? 1 : 0 };
      }
      throw new Error(`fake content db: unhandled query: ${sql.split('\n')[0]}`);
    }),
  } as unknown as Pool;
  return { pool, table };
}

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
    const merged = mergeContextWithOverlay(code, {
      classHitDie: { wizard: 6 },
    });
    // The code's fighter entry is gone — the DB section is the section.
    expect(merged.classHitDie).toEqual({ wizard: 6 });
  });

  it('never overrides protected fields and skips null values', () => {
    const merged = mergeContextWithOverlay(code, {
      id: 'evil-rename',
      displayNoun: null,
    });
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
    expect(isEditableSection('enemyTemplates')).toBe(false);
  });

  it('narratives schema accepts the real malgovia narratives', () => {
    // Regression guard: if the Context narratives shape grows a field the
    // schema doesn't know, a GET→PUT round trip in the editor would 400.
    const result = CAMPAIGN_SECTION_SCHEMAS.narratives.safeParse(malgovia.narratives);
    expect(result.success, JSON.stringify(result.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('narratives schema rejects off-shape values', () => {
    expect(CAMPAIGN_SECTION_SCHEMAS.narratives.safeParse({ genericArrival: 'nope' }).success).toBe(
      false
    );
    expect(CAMPAIGN_SECTION_SCHEMAS.displayNoun.safeParse('').success).toBe(false);
    expect(CAMPAIGN_SECTION_SCHEMAS.displayNoun.safeParse('marsh').success).toBe(true);
  });
});

describe('section CRUD + live refresh', () => {
  it('put → refresh serves the DB version; delete → refresh restores code', async () => {
    const db = makeContentDb({ malgovia: {} });
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

  it('reports a missing campaign and reads back stored data', async () => {
    const db = makeContentDb({ malgovia: { displayNoun: 'marsh' } });
    expect(await getCampaignData(db.pool, 'malgovia')).toEqual({ displayNoun: 'marsh' });
    expect(await getCampaignData(db.pool, 'nope')).toBeNull();
    expect(await putCampaignSection(db.pool, 'nope', 'displayNoun', 'x')).toBe(false);
    expect(await deleteCampaignSection(db.pool, 'nope', 'displayNoun')).toBe(false);
  });

  it('refresh is a no-op for DB-only campaigns (no code context)', async () => {
    const db = makeContentDb({ ghost: { displayNoun: 'boo' } });
    const contexts: Record<string, Context> = {};
    await refreshCampaignOverlay(db.pool, contexts, {}, 'ghost');
    expect(Object.keys(contexts)).toEqual([]);
  });
});

describe('applyCampaignOverlays', () => {
  it('replaces matching contexts in place and skips unknown/malformed rows', async () => {
    const contexts: Record<string, Context> = {
      malgovia: codeCtx({ id: 'malgovia', displayNoun: 'vale' }),
      sandbox: codeCtx({ id: 'sandbox', displayNoun: 'sandbox' }),
    };
    const pool = makePool([
      { id: 'malgovia', data: { displayNoun: 'db-vale' } },
      { id: 'ghost', data: { displayNoun: 'nope' } }, // no code context
      { id: 'sandbox', data: ['not', 'an', 'object'] }, // malformed
    ]);
    await applyCampaignOverlays(pool, contexts);
    expect(contexts.malgovia.displayNoun).toBe('db-vale');
    expect(contexts.sandbox.displayNoun).toBe('sandbox');
    expect(Object.keys(contexts)).toEqual(['malgovia', 'sandbox']);
  });
});
