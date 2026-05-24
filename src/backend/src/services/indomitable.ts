// SRD 5.2.1 — Fighter Indomitable (L9). "If you fail a saving throw, you can
// reroll it with a bonus equal to your Fighter level. You must use the new
// roll," limited to 1/2/3 uses (L9/13/17) per long rest. Uses spent are
// tracked on `class_resource_uses.indomitable` and reset on a long rest.
//
// Auto-resolve policy (player-favorable): the engine resolves saves inline
// during enemy turns, so there is no interactive "do you want to reroll?"
// prompt yet. We reroll a failed save only when a use is available, and we
// commit + spend the use *only if the reroll succeeds* — a daily use is never
// wasted on a reroll that also fails. Because Indomitable only ever triggers
// on an already-failed save, taking the new roll can only match or improve the
// outcome, so this never costs the player anything. A future pass can surface
// it as an interactive reaction so the player chooses *when* to spend (tracked
// in docs/TODO.md).

import { getClassLevel, indomitableRemaining } from './multiclass.js';
import type { Character } from '../types.js';

// The reroll's flat bonus: the character's Fighter level.
export function indomitableBonus(char: Character): number {
  return getClassLevel(char, 'fighter');
}

// Spend one Indomitable use (immutable; mirrors the other resource trackers
// that count points *used* up from 0).
export function consumeIndomitable(char: Character): Character {
  return {
    ...char,
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      indomitable: (char.class_resource_uses?.indomitable ?? 0) + 1,
    },
  };
}

/**
 * Decide whether to spend an Indomitable use on a save that already failed.
 *
 * @param char   the saver (Fighter level drives the bonus + remaining uses)
 * @param reroll a thunk that performs the reroll *with* `indomitableBonus`
 *               folded in and returns whether the new roll met the DC.
 * @returns `saved` — the post-reroll outcome; `used` — whether a use was
 *          consumed (true only when the reroll succeeded).
 */
export function tryIndomitableReroll(
  char: Character,
  reroll: () => boolean
): { saved: boolean; used: boolean } {
  if (indomitableRemaining(char) <= 0) return { saved: false, used: false };
  const passed = reroll();
  return { saved: passed, used: passed };
}
