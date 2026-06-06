// Smoke test for the migration runner using an in-memory mock Pool.
//
// We don't actually run SQL against a real Postgres — the tests verify the
// runner's control flow: creates schema_migrations, detects an existing-DB
// transition, applies pending files in order, records each on success, and
// short-circuits when nothing's pending.

import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';
import { runMigrations } from './migrationRunner.js';

// The real files on disk, sorted the way the runner sorts them — so adding a
// migration never requires touching this spec's fixtures.
function migrationFilesOnDisk(): string[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function makeMockPool(opts: { appliedMigrations?: string[]; gameSessionsExists?: boolean }) {
  const applied = new Set(opts.appliedMigrations ?? []);
  const calls: string[] = [];

  const client = {
    query: vi.fn(async (sql: string | { text: string }, params?: unknown[]) => {
      const text = typeof sql === 'string' ? sql : sql.text;
      calls.push(`CLIENT: ${text.split('\n')[0].trim().slice(0, 60)}`);
      // Track inserts from the runner so the test can assert what was recorded.
      if (text.includes('INSERT INTO schema_migrations') && Array.isArray(params)) {
        applied.add(String(params[0]));
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const text = typeof sql === 'string' ? sql : (sql as { text: string }).text;
      calls.push(`POOL: ${text.split('\n')[0].trim().slice(0, 60)}`);
      if (text.match(/COUNT\(\*\)/) && text.includes('schema_migrations')) {
        return { rows: [{ count: String(applied.size) }], rowCount: 1 };
      }
      if (text.includes('EXISTS') && text.includes('game_sessions')) {
        return { rows: [{ exists: !!opts.gameSessionsExists }], rowCount: 1 };
      }
      if (text.includes('SELECT id FROM schema_migrations')) {
        return { rows: [...applied].map((id) => ({ id })), rowCount: applied.size };
      }
      if (text.includes('INSERT INTO schema_migrations') && Array.isArray(params)) {
        // Used by the first-run transition path
        applied.add(String(params[0]));
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => client),
  } as unknown as Pool;

  return { pool, applied, calls, client };
}

describe('migrationRunner', () => {
  it('runs every pending migration transactionally when schema_migrations is empty', async () => {
    const mock = makeMockPool({ appliedMigrations: [], gameSessionsExists: false });
    await runMigrations(mock.pool);
    // Every file in src/backend/migrations should be recorded
    expect(mock.applied.size).toBeGreaterThanOrEqual(8);
    expect([...mock.applied]).toContain('008_drop_leader_columns_recheck.sql');
    // And each one was wrapped in BEGIN/COMMIT
    const transactions = (
      mock.client.query as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      ([sql]: unknown[]) => typeof sql === 'string' && sql.startsWith('BEGIN')
    ).length;
    expect(transactions).toBeGreaterThanOrEqual(8);
  });

  it('only runs migrations not already in schema_migrations', async () => {
    // Pretend everything but the newest file is applied; only it should run.
    const files = migrationFilesOnDisk();
    const newest = files[files.length - 1];
    const mock = makeMockPool({
      appliedMigrations: files.slice(0, -1),
      gameSessionsExists: true,
    });
    await runMigrations(mock.pool);
    const transactions = (
      mock.client.query as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      ([sql]: unknown[]) => typeof sql === 'string' && sql.startsWith('BEGIN')
    ).length;
    expect(transactions).toBe(1); // just the newest file
    expect([...mock.applied]).toContain(newest);
  });

  it('is a no-op when DB is up to date', async () => {
    // Pretend everything currently on disk is applied — runner should do nothing.
    const mock = makeMockPool({
      appliedMigrations: migrationFilesOnDisk(),
      gameSessionsExists: true,
    });
    await runMigrations(mock.pool);
    const ranInTransaction = (
      mock.client.query as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.some(([sql]: unknown[]) => typeof sql === 'string' && sql.startsWith('BEGIN'));
    expect(ranInTransaction).toBe(false);
    // schema_migrations table still gets ensured at boot
    const ensured = (mock.pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
      ([sql]: unknown[]) =>
        typeof sql === 'string' && sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')
    );
    expect(ensured).toBe(true);
  });

  it('aborts startup if a migration fails (rolls back the transaction)', async () => {
    const mock = makeMockPool({ appliedMigrations: [], gameSessionsExists: false });
    (mock.client.query as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({ rows: [], rowCount: 0 }) // BEGIN
    );
    (mock.client.query as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error('syntax error at line 1');
    }); // The actual migration SQL
    await expect(runMigrations(mock.pool)).rejects.toThrow(/Migration 001/);
    const rolledBack = (mock.client.query as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
      ([sql]: unknown[]) => sql === 'ROLLBACK'
    );
    expect(rolledBack).toBe(true);
  });
});
