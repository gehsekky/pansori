// regionTierAt — the per-square encounter-difficulty tier (SRD Tiers of Play,
// loosely) that future procedural wilderness encounters will scale against.
// Resolves a square to the highest covering tierZone rectangle, else baseTier.

import { describe, expect, it } from 'vitest';
import type { Region } from '../../types.js';
import { regionTierAt } from '../../services/mapEngine.js';

const base = (over: Partial<Region>): Region =>
  ({
    id: 'r',
    name: 'R',
    feetPerSquare: 5280,
    gridWidth: 6,
    gridHeight: 6,
    startPos: { x: 0, y: 0 },
    sites: [],
    ...over,
  }) as Region;

describe('regionTierAt', () => {
  it('defaults to baseTier (or 1) outside any zone', () => {
    expect(regionTierAt(base({}), { x: 2, y: 2 })).toBe(1);
    expect(regionTierAt(base({ baseTier: 2 }), { x: 2, y: 2 })).toBe(2);
  });

  it('returns the tier of a covering zone (inclusive, order-independent corners)', () => {
    const r = base({ tierZones: [{ tier: 3, from: { x: 4, y: 4 }, to: { x: 1, y: 1 } }] });
    expect(regionTierAt(r, { x: 1, y: 1 })).toBe(3); // corner
    expect(regionTierAt(r, { x: 4, y: 4 })).toBe(3); // opposite corner
    expect(regionTierAt(r, { x: 0, y: 0 })).toBe(1); // outside → baseTier
  });

  it('takes the highest tier among overlapping zones', () => {
    const r = base({
      tierZones: [
        { tier: 2, from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
        { tier: 3, from: { x: 2, y: 2 }, to: { x: 3, y: 3 } },
      ],
    });
    expect(regionTierAt(r, { x: 3, y: 3 })).toBe(3); // in both → max
    expect(regionTierAt(r, { x: 5, y: 5 })).toBe(2); // only the broad zone
  });
});
