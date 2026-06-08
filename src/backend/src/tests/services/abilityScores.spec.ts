// RE-3 — ability-score generation helpers: point buy, standard array, and the
// 2024 background ability-score increases.

import {
  applyAbilityScoreIncreases,
  isStandardArray,
  isValidForMethod,
  isValidPointBuy,
  pointBuyTotalCost,
} from '../../services/abilityScores.js';
import { describe, expect, it } from 'vitest';
import type { AbilityKey } from '../../types.js';

const scores = (
  str: number,
  dex: number,
  con: number,
  int: number,
  wis: number,
  cha: number
): Record<AbilityKey, number> => ({ str, dex, con, int, wis, cha });

describe('point buy', () => {
  it('totals the per-score costs, null when out of the 8–15 range', () => {
    expect(pointBuyTotalCost(scores(15, 15, 15, 8, 8, 8))).toBe(27); // 9+9+9
    expect(pointBuyTotalCost(scores(16, 8, 8, 8, 8, 8))).toBeNull(); // 16 out of range
  });

  it('is valid only at exactly 27 points within 8–15', () => {
    expect(isValidPointBuy(scores(15, 15, 15, 8, 8, 8))).toBe(true);
    expect(isValidPointBuy(scores(15, 15, 15, 15, 8, 8))).toBe(false); // 36 points
    expect(isValidPointBuy(scores(8, 8, 8, 8, 8, 8))).toBe(false); // 0 points
  });
});

describe('standard array', () => {
  it('accepts any permutation of 15/14/13/12/10/8', () => {
    expect(isStandardArray(scores(8, 10, 12, 13, 14, 15))).toBe(true);
    expect(isStandardArray(scores(15, 14, 13, 12, 10, 8))).toBe(true);
    expect(isStandardArray(scores(15, 14, 13, 12, 11, 8))).toBe(false); // 11 not in the array
  });
});

describe('isValidForMethod', () => {
  it('validates against the declared method; trusts manual/undefined', () => {
    expect(isValidForMethod(scores(15, 14, 13, 12, 10, 8), 'standard_array')).toBe(true);
    expect(isValidForMethod(scores(15, 14, 13, 12, 11, 8), 'standard_array')).toBe(false);
    expect(isValidForMethod(scores(15, 15, 15, 8, 8, 8), 'point_buy')).toBe(true);
    expect(isValidForMethod(scores(18, 18, 18, 18, 18, 18), 'manual')).toBe(true);
    expect(isValidForMethod(scores(18, 18, 18, 18, 18, 18), undefined)).toBe(true);
  });
});

describe('applyAbilityScoreIncreases (background ASI)', () => {
  const base = scores(10, 10, 10, 10, 10, 10);
  const listed = ['str', 'dex', 'con'];

  it('adds +1 to each listed ability (case-insensitive), ignoring unknowns', () => {
    expect(applyAbilityScoreIncreases(base, ['str', 'DEX', 'con'])).toEqual(
      scores(11, 11, 11, 10, 10, 10)
    );
    expect(applyAbilityScoreIncreases(base, ['bogus'])).toEqual(base);
  });

  it('applies the +2/+1 split across two listed abilities', () => {
    expect(applyAbilityScoreIncreases(base, listed, { plus2: 'str', plus1: 'con' })).toEqual(
      scores(12, 10, 11, 10, 10, 10)
    );
    // Case-insensitive on the split too.
    expect(applyAbilityScoreIncreases(base, listed, { plus2: 'DEX', plus1: 'STR' })).toEqual(
      scores(11, 12, 10, 10, 10, 10)
    );
  });

  it('falls back to +1-to-all for an invalid split', () => {
    const plus1All = scores(11, 11, 11, 10, 10, 10);
    // Same ability for +2 and +1.
    expect(applyAbilityScoreIncreases(base, listed, { plus2: 'str', plus1: 'str' })).toEqual(
      plus1All
    );
    // An ability the background doesn't offer.
    expect(applyAbilityScoreIncreases(base, listed, { plus2: 'str', plus1: 'cha' })).toEqual(
      plus1All
    );
  });
});
