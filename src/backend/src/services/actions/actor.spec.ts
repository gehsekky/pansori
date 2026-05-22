import type { CombatEntity, Enemy } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from './actor.js';
import { makeChar } from '../../test-fixtures.js';

describe('pcActor', () => {
  it('builds a PC actor record with kind, char, and safeIdx', () => {
    const char = makeChar({ id: 'pc-1', name: 'Tester' });
    const a = pcActor(char, 0);
    expect(a.kind).toBe('pc');
    expect(a.char).toBe(char);
    expect(a.safeIdx).toBe(0);
  });

  it('preserves the safeIdx exactly (no clamping)', () => {
    const char = makeChar({ id: 'pc-5' });
    const a = pcActor(char, 4);
    expect(a.safeIdx).toBe(4);
  });
});

describe('enemyActor', () => {
  it('builds an enemy actor record with the enemy and grid entity', () => {
    const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;
    const ent: CombatEntity = {
      id: 'orc-1',
      isEnemy: true,
      pos: { x: 5, y: 5 },
      hp: 15,
      maxHp: 15,
      conditions: [],
      condition_durations: {},
    };
    const a = enemyActor(enemy, ent);
    expect(a.kind).toBe('enemy');
    expect(a.enemy).toBe(enemy);
    expect(a.ent).toBe(ent);
  });

  it('accepts an undefined entity (legendary follow-up paths)', () => {
    const enemy = { id: 'lich-boss', name: 'Lich' } as unknown as Enemy;
    const a = enemyActor(enemy);
    expect(a.kind).toBe('enemy');
    expect(a.enemy).toBe(enemy);
    expect(a.ent).toBeUndefined();
  });
});

describe('Actor discriminated narrowing', () => {
  it('narrows to PcActor on kind === "pc"', () => {
    const char = makeChar({ id: 'pc-1' });
    const a = pcActor(char, 0);
    if (a.kind === 'pc') {
      // TypeScript narrowing: char is accessible only inside the
      // pc-branch. The runtime check makes the test independent of
      // type assertions.
      expect(a.char.id).toBe('pc-1');
    } else {
      throw new Error('expected pc actor');
    }
  });

  it('narrows to EnemyActor on kind === "enemy"', () => {
    const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;
    const a = enemyActor(enemy);
    if (a.kind === 'enemy') {
      expect(a.enemy.id).toBe('orc-1');
    } else {
      throw new Error('expected enemy actor');
    }
  });
});
