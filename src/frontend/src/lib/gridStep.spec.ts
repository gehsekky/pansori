// Grid-stepped crawler math (the 3D first-person view's movement layer).
// Conventions under test: heading 0=N (grid y decreases), turns wrap, facing-
// relative moves resolve against the heading, blocked = OOB or obstacle.

import { describe, expect, it } from 'vitest';
import {
  initialHeading,
  isBlocked,
  moveHeading,
  stepTarget,
  turn,
  yawForHeading,
} from './gridStep';

describe('gridStep', () => {
  it('turns wrap in both directions', () => {
    expect(turn(0, 'right')).toBe(1);
    expect(turn(3, 'right')).toBe(0);
    expect(turn(0, 'left')).toBe(3);
    expect(turn(2, 'left')).toBe(1);
  });

  it('facing-relative moves resolve to world headings', () => {
    expect(moveHeading(0, 'forward')).toBe(0);
    expect(moveHeading(0, 'back')).toBe(2);
    expect(moveHeading(0, 'left')).toBe(3);
    expect(moveHeading(1, 'right')).toBe(2);
  });

  it('stepTarget moves one cell per the heading convention (N = y-1)', () => {
    expect(stepTarget({ x: 4, y: 4 }, 0, 'forward')).toEqual({ x: 4, y: 3 });
    expect(stepTarget({ x: 4, y: 4 }, 1, 'forward')).toEqual({ x: 5, y: 4 });
    expect(stepTarget({ x: 4, y: 4 }, 0, 'back')).toEqual({ x: 4, y: 5 });
    expect(stepTarget({ x: 4, y: 4 }, 2, 'left')).toEqual({ x: 5, y: 4 }); // facing S, left = E
  });

  it('isBlocked stops out-of-bounds and obstacle cells', () => {
    const grid = { width: 4, height: 4, obstacles: [{ x: 1, y: 1 }] };
    expect(isBlocked(grid, { x: -1, y: 0 })).toBe(true);
    expect(isBlocked(grid, { x: 4, y: 0 })).toBe(true);
    expect(isBlocked(grid, { x: 1, y: 1 })).toBe(true);
    expect(isBlocked(grid, { x: 2, y: 2 })).toBe(false);
  });

  it('yawForHeading: N=0, E=-π/2 (camera looks down -z at yaw 0)', () => {
    expect(yawForHeading(0)).toBeCloseTo(0);
    expect(yawForHeading(1)).toBeCloseTo(-Math.PI / 2);
    expect(yawForHeading(2)).toBeCloseTo(-Math.PI);
  });

  it('initialHeading faces into the room from the entry edge', () => {
    const grid = { width: 8, height: 8 };
    expect(initialHeading({ x: 4, y: 7 }, grid)).toBe(0); // south edge → face north
    expect(initialHeading({ x: 0, y: 3 }, grid)).toBe(1); // west edge → face east
    expect(initialHeading({ x: 4, y: 0 }, grid)).toBe(2); // north edge → face south
  });
});
