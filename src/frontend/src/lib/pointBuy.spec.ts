// Ability-score point-buy math (2024 PHB): 27 points, scores 8–15, with 14/15
// costing extra. The standard array is itself a maxed-out 27-point spread, so
// it's the natural starting point when the player switches to Point Buy.

import { POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY, pointBuySpent } from './pointBuy';
import { describe, expect, it } from 'vitest';

describe('point-buy cost table', () => {
  it('matches the PHB schedule (8→0 … 13→5, 14→7, 15→9)', () => {
    expect(POINT_BUY_COST).toMatchObject({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
  });

  it('uses a 27-point budget', () => {
    expect(POINT_BUY_BUDGET).toBe(27);
  });
});

describe('pointBuySpent', () => {
  it('costs 0 for the all-8 floor', () => {
    expect(pointBuySpent({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(0);
  });

  it('costs exactly the budget for the standard array (a maxed 27-point build)', () => {
    expect(pointBuySpent(STANDARD_ARRAY)).toBe(POINT_BUY_BUDGET);
  });

  it('sums the per-ability costs (15+13 = 9+5 = 14)', () => {
    expect(pointBuySpent({ str: 15, dex: 13, con: 8, int: 8, wis: 8, cha: 8 })).toBe(14);
  });

  it('treats the 14→15 step as +2 points (the expensive tier)', () => {
    const at14 = pointBuySpent({ str: 14, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    const at15 = pointBuySpent({ str: 15, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    expect(at15 - at14).toBe(2);
  });
});
