// RE-3 — ability-score generation helpers: point buy, standard array, and the
// 2024 background ability-score increases.

import {
  applyAbilityScoreIncreases,
  isStandardArray,
  isValidForMethod,
  isValidPointBuy,
  pointBuyTotalCost,
} from './abilityScores.js';
import { describe, expect, it } from 'vitest';
import type { AbilityKey } from '../types.js';

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
  it('adds +1 to each listed ability (case-insensitive), ignoring unknowns', () => {
    const out = applyAbilityScoreIncreases(scores(10, 10, 10, 10, 10, 10), ['str', 'DEX', 'con']);
    expect(out).toEqual(scores(11, 11, 11, 10, 10, 10));
    expect(applyAbilityScoreIncreases(scores(10, 10, 10, 10, 10, 10), ['bogus'])).toEqual(
      scores(10, 10, 10, 10, 10, 10)
    );
  });
});
