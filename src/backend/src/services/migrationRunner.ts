// Idempotent SQL migration runner. On every backend boot:
//
//   1. CREATE TABLE schema_migrations IF NOT EXISTS (id text primary key,
//      applied_at timestamptz default now()).
//   2. Read src/backend/migrations/*.sql (sorted by filename — the leading
//      numeric prefix is the ordering key), filter out applied ones, then
//      run each remaining file inside a transaction. Record on success.
//
// **Migrations must be idempotent.** Every CREATE TABLE / ADD COLUMN /
// CREATE INDEX needs `IF NOT EXISTS`; every DROP needs `IF EXISTS`. This is
// because the runner happily re-runs older files against pre-populated
// schemas (e.g. on a database that was initialised via Docker's
// docker-entrypoint-initdb.d before this runner existed). All current
// migrations pass this bar.
//
// A failed migration aborts startup so we never serve traffic against a
// partially-migrated schema.
//
// Historical note: an earlier version had a "smart first-run" path that
// pre-marked all current migrations as applied if game_sessions already
// existed. That broke production: 007 (drop leader columns) was incorrectly
// recorded as applied without running, leaving NOT NULL columns the new
// backend code stopped supplying. Migration 008 is the idempotent fix.

import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import type { Pool } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolves from both dev (src/backend/src/services/) and prod
// (dist/services/) layouts — migrations live two parents up either way.
const MIGRATIONS_DIR = join(__dirname, '../../migrations');

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    console.warn(
      `[migrationRunner] No migrations directory at ${MIGRATIONS_DIR} — skipping. (${(err as Error).message})`
    );
    return;
  }

  if (files.length === 0) {
    console.log('[migrationRunner] No SQL files found — nothing to run.');
    return;
  }

  const { rows: appliedRows } = await pool.query<{ id: string }>(
    'SELECT id FROM schema_migrations'
  );
  const applied = new Set(appliedRows.map((r) => r.id));
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`[migrationRunner] DB is up to date (${files.length} applied).`);
    return;
  }

  console.log(`[migrationRunner] Applying ${pending.length} migration(s): ${pending.join(', ')}`);

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrationRunner]   ✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrationRunner]   ✗ ${file} — ${(err as Error).message}`);
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
