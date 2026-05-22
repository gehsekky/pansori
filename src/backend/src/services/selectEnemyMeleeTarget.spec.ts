// Direct tests for selectEnemyMeleeTarget — extracted from runEnemyTurns
// as part of the monsters-as-action-subjects refactor (architecture
// audit #5).

import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { GameState } from '../types.js';
import { selectEnemyMeleeTarget } from './gameEngine.js';

const buildStateWithEntities = (entities: GameState['entities']): GameState => ({
  ...makeState(),
  entities,
});

describe('selectEnemyMeleeTarget', () => {
  it('returns -1 targetCharIdx when no entities array is present', () => {
    const st = makeState(); // no entities
    const result = selectEnemyMeleeTarget('goblin-1', st);
    expect(result.targetCharIdx).toBe(-1);
    expect(result.targetEnt).toBeUndefined();
  });

  it('picks the nearest living PC by Chebyshev distance', () => {
    const pc1 = makeChar({ id: 'pc-1' });
    const pc2 = makeChar({ id: 'pc-2' });
    const st: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [pc1, pc2],
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 10, y: 10 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'pc-2',
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'goblin-1',
          isEnemy: true,
          pos: { x: 0, y: 0 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = selectEnemyMeleeTarget('goblin-1', st);
    expect(result.targetEnt?.id).toBe('pc-2'); // closer to (0,0)
    expect(result.targetCharIdx).toBe(1);
  });

  it('skips dead PCs (hp <= 0) when picking a target', () => {
    const downed = makeChar({ id: 'pc-1', hp: 0 });
    const alive = makeChar({ id: 'pc-2', hp: 10 });
    const st: GameState = {
      ...makeState({ id: 'pc-1', hp: 0 }),
      characters: [downed, alive],
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 0,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'pc-2',
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'goblin-1',
          isEnemy: true,
          pos: { x: 0, y: 0 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = selectEnemyMeleeTarget('goblin-1', st);
    expect(result.targetEnt?.id).toBe('pc-2'); // downed pc-1 skipped despite being closer
  });

  it('skips animal companions when picking a target', () => {
    const ranger = makeChar({ id: 'pc-1' });
    const st: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [ranger],
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'pc-1:companion',
          isEnemy: false,
          isCompanion: true,
          pos: { x: 1, y: 1 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'goblin-1',
          isEnemy: true,
          pos: { x: 0, y: 0 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = selectEnemyMeleeTarget('goblin-1', st);
    expect(result.targetEnt?.id).toBe('pc-1'); // companion skipped
  });

  it('returns the enemy entity for downstream positioning', () => {
    const pc = makeChar({ id: 'pc-1' });
    const st = buildStateWithEntities([
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 3, y: 3 },
        hp: 10,
        maxHp: 10,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'goblin-1',
        isEnemy: true,
        pos: { x: 7, y: 7 },
        hp: 8,
        maxHp: 8,
        conditions: [],
        condition_durations: {},
      },
    ]);
    void pc;
    const result = selectEnemyMeleeTarget('goblin-1', st);
    expect(result.enemyEnt?.pos).toEqual({ x: 7, y: 7 });
  });
});
