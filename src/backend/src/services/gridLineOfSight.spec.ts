// RE-4 — grid line-of-sight. `cellsOnLine` (supercover walk) + `hasLineOfSight`
// (solid obstacles strictly between two squares block targeting; endpoints
// never block). These are pure geometry helpers in gridEngine.

import { cellsOnLine, hasLineOfSight } from './gridEngine.js';
import { describe, expect, it } from 'vitest';
import type { GridPos } from '../types.js';

const p = (x: number, y: number): GridPos => ({ x, y });
const key = (c: GridPos) => `${c.x},${c.y}`;

describe('cellsOnLine', () => {
  it('includes both endpoints', () => {
    const cells = cellsOnLine(p(0, 0), p(3, 0));
    expect(cells[0]).toEqual(p(0, 0));
    expect(cells[cells.length - 1]).toEqual(p(3, 0));
  });

  it('walks a horizontal run cell by cell', () => {
    expect(cellsOnLine(p(0, 2), p(3, 2)).map(key)).toEqual(['0,2', '1,2', '2,2', '3,2']);
  });

  it('is 4-connected on a diagonal (no skipped corners)', () => {
    const cells = cellsOnLine(p(0, 0), p(2, 2));
    // Each consecutive step differs by exactly one in a single axis.
    for (let i = 1; i < cells.length; i++) {
      const d = Math.abs(cells[i].x - cells[i - 1].x) + Math.abs(cells[i].y - cells[i - 1].y);
      expect(d).toBe(1);
    }
    expect(cells.map(key)).toContain('2,2');
  });

  it('is symmetric in the set of cells touched (order aside)', () => {
    const ab = cellsOnLine(p(1, 1), p(4, 3))
      .map(key)
      .sort();
    const ba = cellsOnLine(p(4, 3), p(1, 1))
      .map(key)
      .sort();
    expect(ab).toEqual(ba);
  });
});

describe('hasLineOfSight', () => {
  it('is clear with no blockers', () => {
    expect(hasLineOfSight(p(0, 0), p(5, 0), [])).toBe(true);
  });

  it('is blocked by an obstacle directly between', () => {
    expect(hasLineOfSight(p(0, 0), p(4, 0), [p(2, 0)])).toBe(false);
  });

  it('ignores obstacles on the endpoints themselves', () => {
    // An obstacle co-located with the source or the target never blocks.
    expect(hasLineOfSight(p(0, 0), p(4, 0), [p(0, 0)])).toBe(true);
    expect(hasLineOfSight(p(0, 0), p(4, 0), [p(4, 0)])).toBe(true);
  });

  it('is clear when the obstacle is off the line', () => {
    expect(hasLineOfSight(p(0, 0), p(4, 0), [p(2, 1)])).toBe(true);
  });

  it('blocks a diagonal sightline through a corner pillar', () => {
    // Perfect diagonal (0,0)→(3,3); the supercover routes through (1,0)/(1,1)
    // etc. A pillar on that route blocks.
    expect(hasLineOfSight(p(0, 0), p(3, 3), [p(1, 1)])).toBe(false);
  });

  it('is symmetric (A sees B iff B sees A)', () => {
    const wall = [p(2, 2)];
    expect(hasLineOfSight(p(0, 2), p(4, 2), wall)).toBe(hasLineOfSight(p(4, 2), p(0, 2), wall));
  });
});
