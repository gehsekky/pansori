// Campaign registry sync — verifies the startup upsert against a mock Pool:
// one upsert per discovered context, name fallback chain, and that rows are
// never deleted (additive sync).

import { campaignDisplayName, syncCampaignRegistry } from './campaignRegistry.js';
import { describe, expect, it, vi } from 'vitest';
import type { Context } from '../types.js';
import type { Pool } from 'pg';

function makeMockPool() {
  const upserts: Array<{ id: string; name: string }> = [];
  const queries: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push(sql);
      if (sql.includes('INSERT INTO campaigns') && Array.isArray(params)) {
        upserts.push({ id: String(params[0]), name: String(params[1]) });
      }
      return { rows: [], rowCount: 1 };
    }),
  } as unknown as Pool;
  return { pool, upserts, queries };
}

function ctx(partial: Partial<Context> & { id: string }): Context {
  return partial as Context;
}

describe('campaignDisplayName', () => {
  it('prefers campaign.world_name, then displayNoun, then id', () => {
    expect(
      campaignDisplayName(
        ctx({ id: 'malgovia', displayNoun: 'vale', campaign: { world_name: 'Malgovia' } as never })
      )
    ).toBe('Malgovia');
    expect(campaignDisplayName(ctx({ id: 'sandbox', displayNoun: 'sandbox' }))).toBe('sandbox');
    expect(campaignDisplayName(ctx({ id: 'bare' }))).toBe('bare');
  });
});

describe('syncCampaignRegistry', () => {
  it('upserts one row per context with the resolved display name', async () => {
    const mock = makeMockPool();
    await syncCampaignRegistry(mock.pool, {
      malgovia: ctx({ id: 'malgovia', campaign: { world_name: 'Malgovia' } as never }),
      sandbox: ctx({ id: 'sandbox', displayNoun: 'sandbox' }),
    });
    expect(mock.upserts).toEqual([
      { id: 'malgovia', name: 'Malgovia' },
      { id: 'sandbox', name: 'sandbox' },
    ]);
    // Upsert, not plain insert — re-running on an existing registry updates.
    expect(mock.queries.every((q) => !q.startsWith('DELETE'))).toBe(true);
    // Code-authored campaigns register as global; the conflict-update must
    // NOT touch visibility (admin demotions survive restarts).
    expect(mock.queries[0]).toContain('visibility');
    expect(mock.queries[0]).not.toContain('SET visibility');
  });

  it('handles an empty context map without touching the table', async () => {
    const mock = makeMockPool();
    await syncCampaignRegistry(mock.pool, {});
    expect(mock.upserts).toEqual([]);
  });

  it('never issues deletes for stale registry rows', async () => {
    const mock = makeMockPool();
    await syncCampaignRegistry(mock.pool, { only: ctx({ id: 'only' }) });
    expect(mock.queries.some((q) => q.includes('DELETE'))).toBe(false);
  });
});
