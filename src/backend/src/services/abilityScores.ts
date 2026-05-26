// RE-3 — ability-score generation (SRD 5.2.1 character creation). Pure helpers
// for the two RAW point-spend methods plus the 2024 background ability-score
// increases. The creation route validates a client-supplied score set against
// the chosen method, then applies the background increases.

import type { AbilityKey } from '../types.js';

export const ABILITIES: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// SRD Standard Array — assign these six values, one per ability.
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

// SRD Point Buy — every ability starts at 8 and may be raised to 15; the table
// gives the point cost of a final score. 27 points to spend.
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
export const POINT_BUY_BUDGET = 27;

type Scores = Record<AbilityKey, number>;

/** Total point-buy cost of a score set, or null if any score is outside the
 *  legal 8–15 point-buy range. */
export function pointBuyTotalCost(scores: Scores): number | null {
  let total = 0;
  for (const a of ABILITIES) {
    const cost = POINT_BUY_COST[scores[a]];
    if (cost === undefined) return null; // out of the 8–15 range
    total += cost;
  }
  return total;
}

/** True when `scores` is a legal point-buy spread (all 8–15, exactly 27 pts). */
export function isValidPointBuy(scores: Scores): boolean {
  return pointBuyTotalCost(scores) === POINT_BUY_BUDGET;
}

/** True when `scores` is a permutation of the Standard Array. */
export function isStandardArray(scores: Scores): boolean {
  const got = ABILITIES.map((a) => scores[a]).sort((x, y) => x - y);
  const want = [...STANDARD_ARRAY].sort((x, y) => x - y);
  return got.length === want.length && got.every((v, i) => v === want[i]);
}

/** Validate a client-supplied base score set against the generation method.
 *  'manual' (or undefined) skips validation — the caller trusts the input. */
export function isValidForMethod(
  scores: Scores,
  method: 'point_buy' | 'standard_array' | 'manual' | undefined
): boolean {
  if (method === 'point_buy') return isValidPointBuy(scores);
  if (method === 'standard_array') return isStandardArray(scores);
  return true;
}

/** Apply the 2024 background ability-score increases to a base score set. The
 *  background lists up to three eligible abilities. RAW gives the player two
 *  options:
 *    - `split` supplied: +2 to `split.plus2` and +1 to `split.plus1` (both must
 *      be among the background's listed abilities, and distinct), or
 *    - `split` omitted / invalid: +1 to each of the listed abilities.
 *  An invalid split falls back to the +1-to-all option rather than erroring. */
export function applyAbilityScoreIncreases(
  base: Scores,
  increases: readonly string[],
  split?: { plus2: string; plus1: string } | null
): Scores {
  const out = { ...base };
  const eligible = increases.map((a) => a.toLowerCase());
  if (split) {
    const p2 = split.plus2.toLowerCase() as AbilityKey;
    const p1 = split.plus1.toLowerCase() as AbilityKey;
    const valid =
      p2 !== p1 &&
      ABILITIES.includes(p2) &&
      ABILITIES.includes(p1) &&
      eligible.includes(p2) &&
      eligible.includes(p1);
    if (valid) {
      out[p2] = (out[p2] ?? 10) + 2;
      out[p1] = (out[p1] ?? 10) + 1;
      return out;
    }
    // Invalid split (unknown ability, duplicate, or not offered by the
    // background) — fall through to the safe +1-to-all default.
  }
  for (const a of eligible) {
    const key = a as AbilityKey;
    if (ABILITIES.includes(key)) out[key] = (out[key] ?? 10) + 1;
  }
  return out;
}
