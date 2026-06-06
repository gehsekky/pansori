// DB-first context resolution — the merge rules that bridge DB-authored
// campaign content and the campaignData/ code folders: DB top-level fields
// win, code fills the rest, the merge is shallow (whole-section replace),
// protected fields and malformed overlays are ignored.

import { applyCampaignOverlays, mergeContextWithOverlay } from './campaignContent.js';
import { describe, expect, it, vi } from 'vitest';
import type { Context } from '../types.js';
import type { Pool } from 'pg';

function codeCtx(partial: Partial<Context> & { id: string }): Context {
  return partial as Context;
}

function makePool(rows: Array<{ id: string; data: unknown }>) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  } as unknown as Pool;
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
