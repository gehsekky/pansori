// Fog of war (regional map): revealRegional permanently discovers cells within
// the party's circular sight radius, accumulating across moves. A travel move
// reveals the radius along the WHOLE route walked, not just the destination.

import type { CampaignData, GameState } from '../types.js';
import {
  SIGHT_RADIUS,
  resolveMarkerMove,
  revealRegional,
  revealRegionalCells,
} from './mapEngine.js';
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

describe('revealRegionalCells — reveal around a list of cells', () => {
  it('reveals the sight radius around every supplied cell, accumulating', () => {
    const base = stAt(0, 0, undefined);
    const s = seen(
      revealRegionalCells(campaign, base, 'reg1', [
        { x: 5, y: 4 },
        { x: 9, y: 4 },
      ])
    );
    expect(s.has('5,4')).toBe(true); // first cell center
    expect(s.has('9,4')).toBe(true); // second cell center
    expect(s.has('7,4')).toBe(true); // between the two discs, covered by both
  });

  it('reveals regardless of map_level (so a route still banks after descending)', () => {
    // map_level is 'town' here — revealRegionalCells keys off the explicit region
    // id, not st.map_level, so it still records the overland cells.
    const town = { map_level: 'town', revealed_cells: undefined } as unknown as GameState;
    const s = seen(revealRegionalCells(campaign, town, 'reg1', [{ x: 2, y: 2 }]));
    expect(s.has('2,2')).toBe(true);
  });
});

describe('travel reveals fog along the WHOLE route (not just the destination)', () => {
  // A 1-tall region forces the BFS path straight along y=0, so the mid-route
  // cell is deterministic.
  const corridor = {
    world_name: 'Corridor',
    intro: '',
    rooms: [],
    regions: [
      {
        id: 'corr',
        name: 'C',
        feetPerSquare: 5280,
        gridWidth: 12,
        gridHeight: 1,
        startPos: { x: 0, y: 0 },
        sites: [],
      },
    ],
  } as unknown as CampaignData;

  it('reveals a mid-route cell the destination radius alone would miss', () => {
    const st = {
      map_level: 'regional',
      current_region_id: 'corr',
      marker_pos: { x: 0, y: 0 },
    } as unknown as GameState;
    // The hour-per-click travel turn marches 3 squares per click at Normal
    // pace — march the corridor in legs until the destination is reached.
    let cur = st;
    let res = resolveMarkerMove(corridor, [], cur, { x: 11, y: 0 });
    expect(res.rejected).toBeUndefined();
    expect(res.st.marker_pos).toEqual({ x: 3, y: 0 }); // first hour's leg
    for (let leg = 0; leg < 3; leg++) {
      cur = res.st;
      res = resolveMarkerMove(corridor, [], cur, { x: 11, y: 0 });
    }
    expect(res.st.marker_pos).toEqual({ x: 11, y: 0 });
    const s = new Set(res.st.revealed_cells?.corr ?? []);
    // Destination radius-3 around (11,0) only reaches x ≥ 8 — so (5,0) proves
    // the route itself was revealed, not just where the party ended up.
    expect(s.has('5,0')).toBe(true);
    expect(s.has('0,0')).toBe(true); // start
    expect(s.has('11,0')).toBe(true); // destination
  });
});
