import { CURRENT_SCHEMA_VERSION, applyStateMigrations } from '../../src/services/stateSchema.js';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/types.js';
import { makeState } from '../../src/test-fixtures.js';

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

// Legacy clock fields aren't on the current GameState type; build loose views.
type LegacyClock = { world_day?: number; world_hour?: number; world_minute?: number };
const legacy = (over: LegacyClock): GameState =>
  ({ ...makeState(), schemaVersion: 1, ...over }) as unknown as GameState;
const clock = (s: GameState): LegacyClock => s as unknown as LegacyClock;

describe('v1 → v2 clock migration (world_day/world_hour → world_minute)', () => {
  it('collapses world_day + world_hour into world_minute (+480 baseline)', () => {
    // Day 2 (1440) + 14.5h (870) + 08:00 baseline (480) = 2790.
    const migrated = clock(applyStateMigrations(legacy({ world_day: 2, world_hour: 14.5 })));
    expect(migrated.world_minute).toBe(2790);
    expect(migrated.world_day).toBeUndefined();
    expect(migrated.world_hour).toBeUndefined();
  });

  it('a save with no clock fields lands on the Day 1 08:00 baseline (480)', () => {
    expect(clock(applyStateMigrations(legacy({}))).world_minute).toBe(480);
  });

  it('the common world_day:1/world_hour:0 save becomes 480', () => {
    expect(clock(applyStateMigrations(legacy({ world_day: 1, world_hour: 0 }))).world_minute).toBe(
      480
    );
  });

  it('is idempotent — already-migrated world_minute is preserved, stale legacy stripped', () => {
    const once = applyStateMigrations(legacy({ world_day: 9, world_minute: 1000 }));
    expect(clock(once).world_minute).toBe(1000); // existing value wins
    expect(clock(once).world_day).toBeUndefined();
    const twice = applyStateMigrations(once);
    expect(clock(twice).world_minute).toBe(1000);
  });
});
