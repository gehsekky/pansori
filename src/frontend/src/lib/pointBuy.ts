// Ability-score generation constants shared by the creation flow (CharScreen)
// and its tests. Kept out of the component file so React Fast Refresh stays
// happy (component files should export only components).

export type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

const KEYS: (keyof AbilityScores)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// PHB p.13 — the deterministic alternative to rolling. Also a maxed-out
// 27-point spread, so it doubles as the starting point for Point Buy.
export const STANDARD_ARRAY: AbilityScores = {
  str: 15,
  dex: 14,
  con: 13,
  int: 12,
  wis: 10,
  cha: 8,
};

// PHB p.13 point buy — 27 points, scores 8–15, with 14/15 costing extra.
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function pointBuySpent(stats: AbilityScores): number {
  return KEYS.reduce((sum, k) => sum + (POINT_BUY_COST[stats[k]] ?? 0), 0);
}

// Manual entry bounds — a generous range so players can build custom heroes
// (the backend applies the final scores as-is, no method re-validation).
export const MANUAL_MIN = 3;
export const MANUAL_MAX = 20;
