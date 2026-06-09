// combatGridDims resolves the combat grid's cell COUNT for a room: the room's
// own gridWidth/gridHeight win, falling back to the campaign-wide Context
// default, then the shared default — all run through clampCombatDim so the
// backend bounds and the FE renderer agree on a safe range.

import { COMBAT_GRID_DEFAULT, COMBAT_GRID_MAX, COMBAT_GRID_MIN } from '../../types.js';
import type { Context, Seed } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { combatGridDims } from '../../services/gameEngine.js';

const seedWith = (rooms: Array<Record<string, unknown>>): Seed =>
  ({ rooms, enemies: {}, loot: {} }) as unknown as Seed;
const ctx = (gridWidth?: number, gridHeight?: number): Context =>
  ({ gridWidth, gridHeight }) as unknown as Context;

describe('combatGridDims', () => {
  it('prefers the room’s own grid size', () => {
    const seed = seedWith([{ id: 'r1', name: 'Hall', desc: '', gridWidth: 14, gridHeight: 12 }]);
    expect(combatGridDims('r1', seed, ctx(8, 8))).toEqual({ w: 14, h: 12 });
  });

  it('falls back to the campaign Context default when the room has no size', () => {
    const seed = seedWith([{ id: 'r1', name: 'Hall', desc: '' }]);
    expect(combatGridDims('r1', seed, ctx(8, 9))).toEqual({ w: 8, h: 9 });
  });

  it('falls back to the shared default when neither room nor Context sets a size', () => {
    const seed = seedWith([{ id: 'r1', name: 'Hall', desc: '' }]);
    expect(combatGridDims('r1', seed, ctx())).toEqual({
      w: COMBAT_GRID_DEFAULT,
      h: COMBAT_GRID_DEFAULT,
    });
  });

  it('uses the Context default for an unknown / missing room id', () => {
    const seed = seedWith([{ id: 'r1', name: 'Hall', desc: '', gridWidth: 14, gridHeight: 12 }]);
    expect(combatGridDims('nope', seed, ctx(11, 11))).toEqual({ w: 11, h: 11 });
    expect(combatGridDims(undefined, seed, ctx(11, 11))).toEqual({ w: 11, h: 11 });
  });

  it('clamps oversized room dimensions down to the max', () => {
    const seed = seedWith([{ id: 'r1', name: 'Hall', desc: '', gridWidth: 40, gridHeight: 99 }]);
    expect(combatGridDims('r1', seed, ctx())).toEqual({
      w: COMBAT_GRID_MAX,
      h: COMBAT_GRID_MAX,
    });
  });

  it('clamps undersized room dimensions up to the min', () => {
    const seed = seedWith([{ id: 'r1', name: 'Hall', desc: '', gridWidth: 2, gridHeight: 1 }]);
    expect(combatGridDims('r1', seed, ctx())).toEqual({
      w: COMBAT_GRID_MIN,
      h: COMBAT_GRID_MIN,
    });
  });
});
