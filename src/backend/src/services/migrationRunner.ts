// Idempotent SQL migration runner. On every backend boot:
//
//   1. CREATE TABLE schema_migrations IF NOT EXISTS (id text primary key,
//      applied_at timestamptz default now()).
//   2. If the table is new but `game_sessions` already exists, treat the
//      current set of migration files as "already applied" — this is the
//      transition for DBs that were initialised via Docker's
//      docker-entrypoint-initdb.d (which doesn't track history). Without
//      this, we'd try to re-run 001_init etc. against a populated DB.
//   3. Read src/backend/migrations/*.sql (sorted by filename — the leading
//      numeric prefix is the ordering key), filter out applied ones, then
//      run each remaining file inside a transaction. Record on success.
//
// A failed migration aborts startup so we never serve traffic against a
// partially-migrated schema.

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

  // First-time transition: if schema_migrations is empty BUT the DB already
  // has game_sessions, mark all current files as applied so we don't try to
  // re-run 001_init.sql against an existing schema.
  const {
    rows: [{ count }],
  } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM schema_migrations');
  if (count === '0') {
    const {
      rows: [{ exists }],
    } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'game_sessions'
       ) AS exists`
    );
    if (exists) {
      console.log(
        `[migrationRunner] First run on an existing DB — recording ${files.length} migration${files.length === 1 ? '' : 's'} as already applied (schema came from docker-entrypoint-initdb.d).`
      );
      for (const file of files) {
        await pool.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [
          file,
        ]);
      }
      return;
    }
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
