// Versioned schema migration ladder for `GameState`. Existing saved
// sessions in the database are JSONB blobs; when the engine loads
// one, `normalizeState` (gameEngine.ts) routes the raw object through
// this module to stamp the schema version and apply any pending
// migrations.
//
// **Why this exists.** Before versioning, `normalizeState` did blind
// default-backfill — every missing field got a hard-coded default.
// That works as long as defaults match what an old save would have
// had. The moment a default is *wrong* for some prior version (e.g.,
// a renamed field, a value derived from another field, a structural
// shape change), there's no path to write per-version logic. The
// version stamp gives the engine a discriminator: "this save was
// written under v1; run vN-to-vN+1 migrations until current."
//
// **Versioning policy.** Bump `CURRENT_SCHEMA_VERSION` when:
//   - A field's meaning changes (not just an added optional field).
//   - A field is renamed or moved.
//   - A derived/computed field needs a one-time write to existing
//     saves.
// Simply adding a new optional field with a safe default does NOT
// require a bump — the existing default-backfill in `normalizeState`
// covers that case. Reserve version bumps for changes that need
// per-row logic.
//
// **Migration functions must be pure and idempotent.** A migration
// is allowed to run more than once against the same input shape
// without changing the output. This protects against partial runs
// and lets the ladder restart safely.

import type { GameState } from '../types.js';

/**
 * Current `GameState` schema version.
 *
 * Version history:
 * - **v0** — pre-versioning (no `schemaVersion` field). Treated as
 *   the initial shape; the existing field-level backfill in
 *   `normalizeState` (gameEngine.ts) handles missing optional fields.
 *   No structural migration needed to reach v1; `migrateV0ToV1` only
 *   stamps the version.
 * - **v1** — `schemaVersion` field present.
 * - **v2** — the in-game clock: legacy `world_day` (int) + `world_hour`
 *   (float) collapse into a single `world_minute` (int). See
 *   `migrateV1ToV2`.
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Apply schema migrations to bring `state` from its declared version
 * up to `CURRENT_SCHEMA_VERSION`. States with no `schemaVersion`
 * field are treated as v0. Returns the migrated state; the caller
 * stamps `schemaVersion: CURRENT_SCHEMA_VERSION` on the result.
 *
 * If `state.schemaVersion > CURRENT_SCHEMA_VERSION` (a save written
 * by a newer engine loaded by an older deploy), the migration is
 * skipped and a warning is logged. This shouldn't happen in normal
 * deploys but is defensive against rollback scenarios.
 */
export function applyStateMigrations(state: GameState): GameState {
  const from = state.schemaVersion ?? 0;
  if (from > CURRENT_SCHEMA_VERSION) {
    // Newer save loaded by older engine. Pass through unchanged —
    // the alternative (downgrading) is dangerous and there's no
    // expected workflow that hits this in production.
    return state;
  }
  let working = state;
  if (from < 1) {
    working = migrateV0ToV1(working);
  }
  if (from < 2) {
    working = migrateV1ToV2(working);
  }
  return { ...working, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/**
 * v0 → v1: stamp the schema version. No structural changes — v0 and
 * v1 share the same shape (the existing default-backfill in
 * `normalizeState` already brought pre-versioning saves up to spec).
 * This migration exists to seed the ladder so future v1 → v2
 * migrations have a defined "from" version.
 */
function migrateV0ToV1(state: GameState): GameState {
  return state;
}

/**
 * v1 → v2: collapse the legacy `world_day` (int, always 1 — never advanced) +
 * `world_hour` (float hours, travel-only) into a single `world_minute` (int).
 * Every save lands on a Day 1 08:00 origin (+480) so the clock never opens at
 * "00:00 · night"; since no clock was ever displayed under v1, shifting the
 * origin is imperceptible. Pure + idempotent: if `world_minute` is already set,
 * just strip any stale legacy fields.
 */
function migrateV1ToV2(state: GameState): GameState {
  // Legacy fields aren't on the current GameState type; read them off a loose view.
  const legacy = state as GameState & { world_day?: number; world_hour?: number };
  const { world_day, world_hour, ...rest } = legacy;
  if (typeof rest.world_minute === 'number') return rest;
  // SRD: 1 day = 1440 min; baseline Day 1 08:00 = 480 min.
  const world_minute = ((world_day ?? 1) - 1) * 1440 + Math.round((world_hour ?? 0) * 60) + 480;
  return { ...rest, world_minute };
}
