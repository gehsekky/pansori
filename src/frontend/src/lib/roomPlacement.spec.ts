// Auto-placement for pos-less room objects (the 3D view's physical stand-in
// for the 2D choice list). Under test: determinism, authored-pos precedence,
// occupied/bounds avoidance, and spreading (no two objects share a cell).

import { describe, expect, it } from 'vitest';
import { placeRoomObjects } from './roomPlacement';

describe('placeRoomObjects', () => {
  it('is deterministic and only places objects without an authored pos', () => {
    const objects = [{ id: 'barrels' }, { id: 'chest', pos: { x: 2, y: 2 } }, { id: 'tracks' }];
    const a = placeRoomObjects(objects, 7, 6, new Set());
    const b = placeRoomObjects(objects, 7, 6, new Set());
    expect(a).toEqual(b);
    expect(a.has('chest')).toBe(false); // authored pos wins, nothing to assign
    expect(a.get('barrels')).toBeDefined();
    expect(a.get('tracks')).toBeDefined();
  });

  it('avoids occupied cells, authored-object cells, and stays in bounds', () => {
    const occupied = new Set(['0,0', '1,0', '2,0', '3,0']);
    const objects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'fixed', pos: { x: 4, y: 0 } }];
    const placed = placeRoomObjects(objects, 5, 3, occupied);
    const cells = new Set<string>();
    for (const [, p] of placed) {
      const key = `${p.x},${p.y}`;
      expect(occupied.has(key)).toBe(false);
      expect(key).not.toBe('4,0'); // the authored object's cell
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(5);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(3);
      expect(cells.has(key)).toBe(false); // no two objects share a cell
      cells.add(key);
    }
    expect(placed.size).toBe(3);
  });

  it('degrades gracefully: a packed room places what fits, a 0-size room places nothing', () => {
    const occupied = new Set(['0,0', '1,0', '0,1']);
    const placed = placeRoomObjects([{ id: 'a' }, { id: 'b' }], 2, 2, occupied);
    expect(placed.size).toBe(1); // one free cell → one placement
    expect(placeRoomObjects([{ id: 'a' }], 0, 0, new Set()).size).toBe(0);
  });
});
