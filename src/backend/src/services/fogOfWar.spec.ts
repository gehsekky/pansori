// Fog of war (regional map): revealRegional permanently discovers cells within
// the party's circular sight radius, accumulating across moves.

import type { CampaignData, GameState } from '../types.js';
import { SIGHT_RADIUS, revealRegional } from './mapEngine.js';
import { describe, expect, it } from 'vitest';

const campaign = {
  world_name: 'Fog',
  intro: '',
  rooms: [],
  regions: [
    {
      id: 'reg1',
      name: 'R',
      feetPerSquare: 5280,
      gridWidth: 12,
      gridHeight: 8,
      startPos: { x: 0, y: 0 },
      sites: [],
    },
  ],
} as unknown as CampaignData;

const stAt = (x: number, y: number, revealed?: Record<string, string[]>): GameState =>
  ({
    map_level: 'regional',
    current_region_id: 'reg1',
    marker_pos: { x, y },
    revealed_cells: revealed,
  }) as unknown as GameState;

const seen = (st: GameState) => new Set(st.revealed_cells?.reg1 ?? []);

describe('revealRegional', () => {
  it('reveals a circular radius-3 disc around the party', () => {
    const s = seen(revealRegional(campaign, stAt(5, 4)));
    expect(SIGHT_RADIUS).toBe(3);
    expect(s.has('5,4')).toBe(true); // center
    expect(s.has('8,4')).toBe(true); // dx 3 → on the edge
    expect(s.has('5,1')).toBe(true); // dy 3
    expect(s.has('7,6')).toBe(true); // dx2,dy2 = 8 ≤ 9
    expect(s.has('8,6')).toBe(false); // dx3,dy2 = 13 > 9 → outside the circle
    expect(s.has('8,7')).toBe(false); // dx3,dy3 = 18 > 9
  });

  it('clamps to the grid bounds (no negative / off-grid cells)', () => {
    const s = seen(revealRegional(campaign, stAt(0, 0)));
    expect(s.has('0,0')).toBe(true);
    expect([...s].every((k) => k.split(',').every((n) => Number(n) >= 0))).toBe(true);
    expect([...s].some((k) => k === '-1,0' || k === '0,-1')).toBe(false);
  });

  it('accumulates permanently across moves', () => {
    const first = revealRegional(campaign, stAt(0, 0));
    const second = revealRegional(campaign, stAt(8, 4, first.revealed_cells));
    const s = seen(second);
    expect(s.has('0,0')).toBe(true); // still revealed from the first position
    expect(s.has('8,4')).toBe(true); // revealed at the new position
  });

  it('is a no-op when the party is not on the regional grid', () => {
    const town = { ...stAt(5, 4), map_level: 'town' } as GameState;
    expect(revealRegional(campaign, town).revealed_cells).toBeUndefined();
  });
});
