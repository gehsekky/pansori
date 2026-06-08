// NPC approach — the party marker walks to a free cell ADJACENT to an NPC's
// token when talking (clicking the token / "Talk to …"). approachCell picks
// that cell: stays put if already adjacent, prefers the neighbor closest to the
// party, avoids obstacles, and falls back to the NPC's own cell when boxed in.

import { describe, expect, it } from 'vitest';
import type { ActiveGrid } from '../../../src/services/mapEngine.js';
import { approachCell } from '../../../src/services/actions/social.js';

function grid(obstacles: { x: number; y: number }[] = []): ActiveGrid {
  return {
    level: 'local',
    id: 'room',
    name: 'Room',
    width: 7,
    height: 7,
    feetPerSquare: 5,
    terrain: [],
    obstacles,
    startPos: { x: 3, y: 6 },
    transitions: [],
  };
}

describe('approachCell', () => {
  it('stays put when the party is already adjacent to the NPC', () => {
    const from = { x: 3, y: 3 };
    expect(approachCell(grid(), from, { x: 3, y: 2 })).toEqual(from);
  });

  it('treats standing on the NPC cell as adjacent (no move)', () => {
    const from = { x: 3, y: 2 };
    expect(approachCell(grid(), from, { x: 3, y: 2 })).toEqual(from);
  });

  it('walks to an adjacent cell closest to the party', () => {
    // NPC at (3,2); party way down at (3,6) → it picks a y=3 neighbor (the row
    // nearest the party, Chebyshev 3), e.g. (2,3)/(3,3)/(4,3).
    const chosen = approachCell(grid(), { x: 3, y: 6 }, { x: 3, y: 2 });
    expect(chosen.y).toBe(3); // closest row to the party
    expect(Math.max(Math.abs(chosen.x - 3), Math.abs(chosen.y - 2))).toBe(1); // adjacent to NPC
  });

  it('skips obstacle cells when choosing the approach square', () => {
    // Block (3,3) — the otherwise-closest neighbor — so it picks the next best.
    const chosen = approachCell(grid([{ x: 3, y: 3 }]), { x: 3, y: 6 }, { x: 3, y: 2 });
    expect(chosen).not.toEqual({ x: 3, y: 3 });
    // Whatever it picks is in-bounds, not the obstacle, and adjacent to the NPC.
    expect(Math.max(Math.abs(chosen.x - 3), Math.abs(chosen.y - 2))).toBe(1);
  });

  it('falls back to the NPC cell when every neighbor is blocked', () => {
    const target = { x: 0, y: 0 };
    // Block the three in-bounds neighbors of the corner (1,0),(0,1),(1,1).
    const blocked = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(approachCell(grid(blocked), { x: 5, y: 5 }, target)).toEqual(target);
  });
});
