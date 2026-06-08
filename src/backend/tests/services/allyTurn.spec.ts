// RE-1 Phase 4 — ally (companion / summon) turn path. `applyDamageToEntity`
// is the shared non-PC damage primitive; `runAllyTurn` is the AI-default
// ally turn (attack the nearest enemy in reach via the simple
// resolveEnemyAttack roll, not the PC-target computeEnemyAttack).

import type { CombatEntity, GameState } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDamageToEntity, runAllyTurn } from '../../src/services/gameEngine.js';
import {
  baseSandboxSeed,
  makeMinimalContext,
  makeState,
  mockRandom,
} from '../../src/test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

const ent = (over: Partial<CombatEntity> & Pick<CombatEntity, 'id'>): CombatEntity => ({
  isEnemy: false,
  pos: { x: 0, y: 0 },
  hp: 10,
  maxHp: 10,
  conditions: [],
  condition_durations: {},
  ...over,
});

const wolf = (pos: { x: number; y: number }): CombatEntity =>
  ent({
    id: 'wolf',
    side: 'ally',
    companionName: 'Wolf',
    toHit: 0,
    damage: '1d4',
    pos,
    hp: 11,
    maxHp: 11,
  });

const goblin = (pos: { x: number; y: number }, hp = 10): CombatEntity =>
  ent({ id: 'goblin-1', isEnemy: true, ac: 1, pos, hp, maxHp: 10 });

const stateWith = (entities: CombatEntity[]): GameState => ({
  ...makeState(),
  combat_active: true,
  enemies_killed: [],
  entities,
});

describe('applyDamageToEntity', () => {
  it('reduces the target entity HP and floors at 0, leaving others untouched', () => {
    const st = stateWith([ent({ id: 'a', hp: 10 }), ent({ id: 'b', hp: 7 })]);
    const r1 = applyDamageToEntity(st, 'a', 4);
    expect(r1.entities?.find((e) => e.id === 'a')?.hp).toBe(6);
    expect(r1.entities?.find((e) => e.id === 'b')?.hp).toBe(7);
    const r2 = applyDamageToEntity(st, 'a', 999);
    expect(r2.entities?.find((e) => e.id === 'a')?.hp).toBe(0);
  });
});

describe('runAllyTurn', () => {
  it('does nothing when there is no enemy to target', () => {
    const st = stateWith([wolf({ x: 1, y: 1 })]);
    const res = runAllyTurn({
      allyEnt: st.entities![0],
      st,
      seed: baseSandboxSeed,
      context: makeMinimalContext(),
    });
    expect(res.narrative).toBe('');
    expect(res.st).toBe(st);
  });

  it('moves toward and attacks an enemy it can reach this turn', () => {
    mockRandom(0.95, 0.5); // hit + 3 damage (no OA: nobody adjacent at the start square)
    const st = stateWith([wolf({ x: 1, y: 1 }), goblin({ x: 1, y: 5 })]);
    const res = runAllyTurn({
      allyEnt: st.entities![0],
      st,
      seed: baseSandboxSeed,
      context: makeMinimalContext(),
    });
    expect(res.narrative).toContain('closes');
    expect(res.st.entities?.find((e) => e.id === 'goblin-1')?.hp).toBe(7);
  });

  it('does not reach a far enemy in one turn (no attack lands)', () => {
    const st = stateWith([wolf({ x: 1, y: 1 }), goblin({ x: 1, y: 9 })]);
    const res = runAllyTurn({
      allyEnt: st.entities![0],
      st,
      seed: baseSandboxSeed,
      context: makeMinimalContext(),
    });
    expect(res.st.entities?.find((e) => e.id === 'goblin-1')?.hp).toBe(10);
    expect(res.narrative.length).toBeGreaterThan(0);
  });

  it('attacks and damages an adjacent enemy', () => {
    mockRandom(0.95, 0.5); // d20 -> 20 (hit), 1d4 -> 3 damage
    const st = stateWith([wolf({ x: 1, y: 1 }), goblin({ x: 1, y: 2 })]);
    const res = runAllyTurn({
      allyEnt: st.entities![0],
      st,
      seed: baseSandboxSeed,
      context: makeMinimalContext(),
    });
    expect(res.narrative).toContain('Wolf attacks');
    expect(res.narrative).toContain('damage');
    expect(res.st.entities?.find((e) => e.id === 'goblin-1')?.hp).toBe(7);
  });

  it('marks the enemy slain and ends combat when it was the last one', () => {
    mockRandom(0.95, 0.5); // hit, 3 damage -> kills a 3-HP goblin
    const st = stateWith([wolf({ x: 1, y: 1 }), goblin({ x: 1, y: 2 }, 3)]);
    const res = runAllyTurn({
      allyEnt: st.entities![0],
      st,
      seed: baseSandboxSeed,
      context: makeMinimalContext(),
    });
    expect(res.narrative).toContain('slain');
    expect(res.st.enemies_killed).toContain('goblin-1');
    expect(res.st.combat_active).toBe(false);
  });
});
