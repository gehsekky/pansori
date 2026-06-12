// Shared combat-preview math (2D grid + 3D diorama). The shape math mirrors the
// backend gridEngine geometry; these pin the per-shape footprints + the
// same-name enemy disambiguation.

import {
  chebyshev,
  computeAoeCells,
  doubledCellsFor,
  enemyDisplayNames,
  movementCosts,
} from './combatPreview';
import { describe, expect, it } from 'vitest';

describe('combatPreview', () => {
  it('chebyshev distance', () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(3);
    expect(chebyshev({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });

  it('sphere: a 20ft radius covers a 9×9 chebyshev square around the epicenter', () => {
    const cells = computeAoeCells(
      { shape: 'sphere', radiusFt: 20 },
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      12,
      12
    );
    expect(cells.size).toBe(81);
    expect(cells.has('5,5')).toBe(true);
    expect(cells.has('1,5')).toBe(true); // 4 away
    expect(cells.has('0,5')).toBe(false); // 5 away
  });

  it('line: 30ft fires 6 cells along the caster→target direction', () => {
    const cells = computeAoeCells(
      { shape: 'line', radiusFt: 30 },
      { x: 2, y: 2 },
      { x: 5, y: 2 },
      12,
      12
    );
    expect(cells.size).toBe(6);
    expect(cells.has('3,2')).toBe(true);
    expect(cells.has('8,2')).toBe(true);
    expect(cells.has('2,2')).toBe(false); // caster cell excluded
  });

  it('cone: widens with distance and respects the grid bounds', () => {
    const cells = computeAoeCells(
      { shape: 'cone', radiusFt: 15 },
      { x: 0, y: 4 },
      { x: 1, y: 4 },
      10,
      10
    );
    expect(cells.has('1,4')).toBe(true);
    expect(cells.has('3,2')).toBe(true); // within the spread at range 3
    expect(cells.has('4,4')).toBe(false); // beyond 15ft (3 squares)
  });

  it('enemyDisplayNames numbers duplicates and leaves singletons alone', () => {
    const ents = [
      { id: 'a', isEnemy: true },
      { id: 'b', isEnemy: true },
      { id: 'c', isEnemy: true },
      { id: 'pc', isEnemy: false },
    ];
    const names: Record<string, string> = { a: 'Bandit', b: 'Bandit', c: 'Wolf' };
    const display = enemyDisplayNames(ents, (id) => names[id]);
    expect(display('a')).toBe('Bandit #1');
    expect(display('b')).toBe('Bandit #2');
    expect(display('c')).toBe('Wolf');
  });
});

describe('movementCosts — engine-mirrored reachability', () => {
  const open = (w = 8, h = 8) => ({ gridWidth: w, gridHeight: h });

  it('prices plain cells at one square along the BFS path', () => {
    const costs = movementCosts({
      from: { x: 0, y: 0 },
      ...open(),
      blocked: new Set(),
      doubled: new Set(),
      maxSquares: 3,
    });
    expect(costs.get('1,0')).toBe(1);
    expect(costs.get('3,3')).toBe(3); // diagonal — Chebyshev metric
    expect(costs.get('4,4')).toBeUndefined(); // beyond the budget
  });

  it('doubled cells (difficult / unaided swim) cost two — the playtest case', () => {
    // A swim channel across row y=1: a fighter with 6 squares (30 ft) cannot
    // reach (0,4) — 3 plain hops + 1 doubled = 5? No: the channel must be
    // crossed, so the path 0,0→0,4 costs 1+2+1+1 = 5 ≤ 6 ✓, while crossing
    // TWO doubled rows would not. Assert the doubling itself precisely:
    const costs = movementCosts({
      from: { x: 0, y: 0 },
      ...open(),
      blocked: new Set(),
      doubled: new Set(['0,1', '1,1', '2,1', '3,1', '4,1', '5,1', '6,1', '7,1']),
      maxSquares: 6,
    });
    expect(costs.get('0,1')).toBe(2); // stepping INTO the channel costs 2
    expect(costs.get('0,2')).toBe(3); // through it: 2 + 1
    expect(costs.get('0,0')).toBe(0);
  });

  it('a highlighted cell is exactly one the engine accepts: hop-path cost, not cheapest cost', () => {
    // The engine prices findPath's shortest-HOP path even when a longer
    // route would be cheaper — the mirror must do the same.
    const costs = movementCosts({
      from: { x: 0, y: 0 },
      ...open(),
      blocked: new Set(),
      doubled: new Set(['1,0', '1,1']), // a doubled wall the short path crosses
      maxSquares: 4,
    });
    // (2,0): shortest-hop is 2 steps with the first doubled → 3, even though
    // 0,0→0,1→1,2→2,1→2,0 (4 plain hops = 4) also exists.
    expect(costs.get('2,0')).toBe(3);
  });

  it('blocked cells (entities, obstacles) are impassable and unpriced', () => {
    const costs = movementCosts({
      from: { x: 0, y: 0 },
      gridWidth: 3,
      gridHeight: 1,
      blocked: new Set(['1,0']),
      doubled: new Set(),
      maxSquares: 5,
    });
    expect(costs.get('1,0')).toBeUndefined();
    expect(costs.get('2,0')).toBeUndefined(); // walled off on a 1-row grid
  });
});

describe('doubledCellsFor — the per-mover 2× set', () => {
  const room = {
    difficultTerrain: [{ x: 1, y: 1 }],
    climbTerrain: [{ x: 2, y: 2 }],
    swimTerrain: [{ x: 3, y: 3 }],
  };

  it('charges climb/swim without the matching speed; difficult always', () => {
    const set = doubledCellsFor(room, { level: 1 });
    expect(set.has('1,1')).toBe(true);
    expect(set.has('2,2')).toBe(true);
    expect(set.has('3,3')).toBe(true);
  });

  it('waives swim with a swim speed, climb with a climb speed or Thief L3', () => {
    expect(doubledCellsFor(room, { swim_speed_ft: 30, level: 1 }).has('3,3')).toBe(false);
    expect(doubledCellsFor(room, { climb_speed_ft: 20, level: 1 }).has('2,2')).toBe(false);
    expect(doubledCellsFor(room, { subclass: 'thief', level: 3 }).has('2,2')).toBe(false);
    expect(doubledCellsFor(room, { subclass: 'thief', level: 2 }).has('2,2')).toBe(true);
  });
});
