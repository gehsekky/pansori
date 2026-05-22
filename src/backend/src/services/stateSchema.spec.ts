import { CURRENT_SCHEMA_VERSION, applyStateMigrations } from './stateSchema.js';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../types.js';
import { makeState } from '../test-fixtures.js';

describe('applyStateMigrations', () => {
  it('stamps schemaVersion on a state with no version field (treated as v0)', () => {
    const v0: GameState = makeState();
    expect(v0.schemaVersion).toBeUndefined();
    const migrated = applyStateMigrations(v0);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('passes a current-version state through unchanged (idempotent)', () => {
    const v1: GameState = { ...makeState(), schemaVersion: CURRENT_SCHEMA_VERSION };
    const migrated = applyStateMigrations(v1);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Other fields untouched
    expect(migrated.characters).toEqual(v1.characters);
    expect(migrated.current_room).toBe(v1.current_room);
  });

  it('leaves a newer-version save alone (forward-compat / rollback safety)', () => {
    // A save written by a future engine version loaded by an older
    // deploy. Downgrading is dangerous; pass through unchanged.
    const future: GameState = { ...makeState(), schemaVersion: 999 };
    const result = applyStateMigrations(future);
    expect(result.schemaVersion).toBe(999);
  });

  it('preserves all other state fields when migrating from v0', () => {
    // Sanity check: the ladder only stamps the version; existing
    // fields should round-trip without mutation.
    const v0: GameState = makeState(
      { hp: 7, max_hp: 10 },
      { combat_active: true, visited_rooms: ['r1', 'r2', 'r3'] }
    );
    const migrated = applyStateMigrations(v0);
    expect(migrated.characters[0].hp).toBe(7);
    expect(migrated.combat_active).toBe(true);
    expect(migrated.visited_rooms).toEqual(['r1', 'r2', 'r3']);
  });
});
