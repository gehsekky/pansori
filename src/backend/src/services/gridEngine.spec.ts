import type { CombatEntity, GridPos } from '../types.js';
import { describe, expect, it } from 'vitest';
import {
  entitiesInBlast,
  entitiesInCone,
  entitiesInCube,
  entitiesInLine,
  opportunityAttackTriggers,
} from './gridEngine.js';

function ent(id: string, pos: GridPos): CombatEntity {
  return {
    id,
    isEnemy: true,
    pos,
    hp: 10,
    maxHp: 10,
    conditions: [],
    condition_durations: {},
  };
}

describe('AoE geometry — SRD 5.2.1 p.193', () => {
  // Caster at (0,0); aim east. 5 ft per square.

  it('sphere catches all entities within radius', () => {
    const targets = [
      ent('a', { x: 1, y: 0 }), // 5 ft
      ent('b', { x: 2, y: 2 }), // 10 ft
      ent('c', { x: 4, y: 0 }), // 20 ft — out
    ];
    const result = entitiesInBlast({ x: 0, y: 0 }, 15, targets);
    expect(result.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('cone of 15 ft pointing east hits squares within the 45° spread', () => {
    const targets = [
      ent('in-axis', { x: 1, y: 0 }), // along axis, within 5 ft
      ent('in-axis-far', { x: 3, y: 0 }), // along axis, within 15 ft
      ent('in-spread', { x: 2, y: 1 }), // diagonal 10/5 — within cone
      ent('out-too-far', { x: 4, y: 0 }), // 20 ft along — out
      ent('out-behind', { x: -1, y: 0 }), // behind caster — out
      ent('out-too-wide', { x: 1, y: 3 }), // perpendicular wider than along — out
    ];
    const result = entitiesInCone({ x: 0, y: 0 }, { x: 1, y: 0 }, 15, targets);
    expect(result.map((t) => t.id).sort()).toEqual(['in-axis', 'in-axis-far', 'in-spread']);
  });

  it('cube of 15 ft pointing east includes the 3×3 square in front of caster', () => {
    const targets = [
      ent('front-near', { x: 1, y: 0 }),
      ent('front-far', { x: 3, y: 0 }),
      ent('front-up', { x: 2, y: -1 }),
      ent('behind', { x: -1, y: 0 }), // out
      ent('too-far', { x: 4, y: 0 }), // out
    ];
    const result = entitiesInCube({ x: 0, y: 0 }, { x: 1, y: 0 }, 15, targets);
    expect(result.map((t) => t.id).sort()).toEqual(['front-far', 'front-near', 'front-up']);
  });

  it('line of 30 ft pointing east hits only the axis squares', () => {
    const targets = [
      ent('on-line-1', { x: 1, y: 0 }),
      ent('on-line-2', { x: 3, y: 0 }),
      ent('on-line-end', { x: 6, y: 0 }),
      ent('off-line', { x: 2, y: 1 }), // not on the 5-ft-wide line
      ent('out-too-far', { x: 7, y: 0 }), // 35 ft — out
    ];
    const result = entitiesInLine({ x: 0, y: 0 }, { x: 1, y: 0 }, 30, targets);
    expect(result.map((t) => t.id).sort()).toEqual(['on-line-1', 'on-line-2', 'on-line-end']);
  });
});

describe('opportunityAttackTriggers — SRD 5.2.1 p.90 reach weapons', () => {
  // PC mover at (0,0) → moves to (3,0). Two enemies: one at (1,0) with no
  // reach (5 ft), one at (2,0) with reach (10 ft). The mover starts adjacent
  // to both, ends 3 squares (15 ft) away — out of both threat ranges.
  function pcMover(): CombatEntity {
    return {
      id: 'pc',
      isEnemy: false,
      pos: { x: 0, y: 0 },
      hp: 10,
      maxHp: 10,
      conditions: [],
      condition_durations: {},
    };
  }

  it('5-ft enemies provoke when their 5-ft reach drops', () => {
    const e1: CombatEntity = {
      id: 'goblin',
      isEnemy: true,
      pos: { x: 1, y: 0 },
      hp: 5,
      maxHp: 5,
      conditions: [],
      condition_durations: {},
    };
    const triggers = opportunityAttackTriggers(
      pcMover().pos,
      { x: 3, y: 0 },
      [pcMover(), e1],
      false
    );
    expect(triggers.map((e) => e.id)).toEqual(['goblin']);
  });

  it('Reach-weapon enemy threatens at 10 ft', () => {
    // Enemy at (2,0) with reach → mover at (3,0) is still 5 ft away
    // (cheb=1 square × 5 ft) which IS within reach. So no OA.
    const reachEnemy: CombatEntity = {
      id: 'glaive-goblin',
      isEnemy: true,
      pos: { x: 2, y: 0 },
      hp: 5,
      maxHp: 5,
      conditions: [],
      condition_durations: {},
    };
    const triggers = opportunityAttackTriggers(
      pcMover().pos,
      { x: 3, y: 0 },
      [pcMover(), reachEnemy],
      false,
      (e) => (e.id === 'glaive-goblin' ? 10 : 5)
    );
    expect(triggers).toEqual([]); // still within 10 ft reach at the new pos
  });

  it('Reach enemy still provokes when mover leaves the 10-ft window', () => {
    const reachEnemy: CombatEntity = {
      id: 'glaive-goblin',
      isEnemy: true,
      pos: { x: 2, y: 0 },
      hp: 5,
      maxHp: 5,
      conditions: [],
      condition_durations: {},
    };
    const triggers = opportunityAttackTriggers(
      pcMover().pos,
      { x: 5, y: 0 }, // 3 squares from the enemy = 15 ft, beyond 10 ft reach
      [pcMover(), reachEnemy],
      false,
      (e) => (e.id === 'glaive-goblin' ? 10 : 5)
    );
    expect(triggers.map((e) => e.id)).toEqual(['glaive-goblin']);
  });
});
