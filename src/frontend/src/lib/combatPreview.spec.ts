// Shared combat-preview math (2D grid + 3D diorama). The shape math mirrors the
// backend gridEngine geometry; these pin the per-shape footprints + the
// same-name enemy disambiguation.

import { chebyshev, computeAoeCells, enemyDisplayNames } from './combatPreview';
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
