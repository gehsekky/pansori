// SRD 5.2.1 jumping. A Long Jump (horizontal) covers up to your Strength score
// in feet with a ≥10-ft run-up, or half that for a standing jump. A High Jump
// (vertical) reaches 3 + your Strength modifier feet (min 0), half standing.
// Either way each foot jumped costs a foot of movement (enforced by the jump
// action). These are the pure distance helpers.

import { abilityMod } from './rulesEngine.js';

/** SRD Long Jump — horizontal distance in feet. Full with a ≥10-ft run-up;
 *  half (rounded down) for a standing jump. */
export function longJumpDistance(str: number, hasRunUp: boolean): number {
  return hasRunUp ? str : Math.floor(str / 2);
}

/** SRD High Jump — vertical distance in feet: 3 + STR modifier (min 0) with a
 *  ≥10-ft run-up; half (rounded down) standing. */
export function highJumpDistance(str: number, hasRunUp: boolean): number {
  const full = Math.max(0, 3 + abilityMod(str));
  return hasRunUp ? full : Math.floor(full / 2);
}
