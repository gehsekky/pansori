// regionTierAt — the per-square encounter-difficulty tier (SRD Tiers of Play,
// loosely) that future procedural wilderness encounters will scale against.
// Resolves a square to the highest covering tierZone rectangle, else baseTier.

import { describe, expect, it } from 'vitest';
import type { Region } from '../types.js';
import { context } from '../campaignData/malgovia/index.js';
import { regionTierAt } from './mapEngine.js';

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

describe('Malgovia region tiers — grove (1) → crypt/bandit (2) → ice (3)', () => {
  const region = context.campaign?.regions?.find((r) => r.id === 'vale_region')!;
  const at = (x: number, y: number) => regionTierAt(region, { x, y });

  it('the southern grove wilds are Tier 1', () => {
    expect(at(4, 7)).toBe(1); // start / Pinegate door
    expect(at(6, 6)).toBe(1); // the Silent Grove
    expect(at(3, 7)).toBe(1); // the Old Road
  });

  it('the mid eastern lane (crypt + bandit camp) is Tier 2', () => {
    expect(at(10, 3)).toBe(2); // Shattered Crypt
    expect(at(10, 4)).toBe(2); // Bandit Camp
  });

  it('the frozen north (pass + spire) is Tier 3 — endgame', () => {
    expect(at(5, 1)).toBe(3); // the Frozen Pass
    expect(at(9, 1)).toBe(3); // Whispering Pines
    expect(at(1, 0)).toBe(3); // Iceshard Spire
  });
});
