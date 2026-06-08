import type { CombatEntity, GridPos } from '../../src/types.js';
import { describe, expect, it } from 'vitest';
import {
  entitiesInBlast,
  entitiesInCone,
  entitiesInCube,
  entitiesInLine,
  isFlankingPosition,
  opportunityAttackTriggers,
} from '../../src/services/gridEngine.js';

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

describe('AoE geometry — SRD 5.2.1', () => {
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

describe('opportunityAttackTriggers — SRD 5.2.1 reach weapons', () => {
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

// ─── Flanking (DMG 2014 optional rule) ───────────────────────────────────────
//
// Real RAW flanking requires BOTH the attacker and ally to be adjacent
// to the target AND on directly opposite squares of the target perimeter.
// The pre-fix implementation triggered for any axis-opposed positions
// regardless of distance — a multi-PC party would silently flank almost
// every attack after the first PC moved into position.

describe('isFlankingPosition (DMG 2014 optional flanking)', () => {
  const target: GridPos = { x: 5, y: 5 };

  it('flanks when ally is directly opposite + both adjacent', () => {
    // Attacker N (5,4), ally S (5,6) — cardinally opposite, both adjacent.
    expect(isFlankingPosition({ x: 5, y: 4 }, { x: 5, y: 6 }, target)).toBe(true);
    // Attacker E (6,5), ally W (4,5).
    expect(isFlankingPosition({ x: 6, y: 5 }, { x: 4, y: 5 }, target)).toBe(true);
    // Attacker NE (6,4), ally SW (4,6) — diagonally opposite.
    expect(isFlankingPosition({ x: 6, y: 4 }, { x: 4, y: 6 }, target)).toBe(true);
  });

  it('does NOT flank when ally is not adjacent to target', () => {
    // Attacker N (5,4) adjacent; ally S 3 squares away (5,8).
    expect(isFlankingPosition({ x: 5, y: 4 }, { x: 5, y: 8 }, target)).toBe(false);
  });

  it('does NOT flank when attacker is not adjacent to target', () => {
    // Attacker 3 squares N (5,2); ally S adjacent (5,6).
    expect(isFlankingPosition({ x: 5, y: 2 }, { x: 5, y: 6 }, target)).toBe(false);
  });

  it('does NOT flank when ally is on the same side (not opposite)', () => {
    // Attacker N (5,4); ally NE (6,4) — both north-ish, not flanking.
    expect(isFlankingPosition({ x: 5, y: 4 }, { x: 6, y: 4 }, target)).toBe(false);
  });

  it('does NOT flank when ally is one corner off (not the diametric corner)', () => {
    // Attacker NE (6,4); ally SE (6,6) — both east, not opposite.
    expect(isFlankingPosition({ x: 6, y: 4 }, { x: 6, y: 6 }, target)).toBe(false);
  });

  it('does NOT flank when attacker shares the target square (degenerate)', () => {
    expect(isFlankingPosition(target, { x: 5, y: 6 }, target)).toBe(false);
  });

  it('regression: 3-PC party scattered around enemy no longer auto-flanks', () => {
    // Reconstructs the Vale playthrough scenario where a PC at (5,5),
    // another at (5,7), and the enemy somewhere between would trigger
    // the old too-loose flanking check. Strict adjacency now requires
    // both PCs within 1 square of the enemy.
    const enemy: GridPos = { x: 5, y: 6 };
    const pcAttacker: GridPos = { x: 5, y: 5 }; // adjacent (1 sq north)
    const pcAllyFar: GridPos = { x: 5, y: 7 }; // adjacent (1 sq south) — flanks
    const pcAllyTooFar: GridPos = { x: 2, y: 7 }; // 3 sq away — does not flank
    expect(isFlankingPosition(pcAttacker, pcAllyFar, enemy)).toBe(true);
    expect(isFlankingPosition(pcAttacker, pcAllyTooFar, enemy)).toBe(false);
  });
});
