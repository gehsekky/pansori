// SRD 5.2.1 — Fiend Warlock Dark One's Own Luck (L6). "When you make an ability
// check or a saving throw, you can add 1d10 to your roll" (after seeing it,
// before effects), CHA-mod (min 1) uses per long rest, once per roll. Uses are
// tracked on `class_resource_uses.dark_ones_luck` and reset on a long rest.
//
// Auto-resolve policy (mirrors Indomitable): saves resolve inline on enemy
// turns with no interactive prompt, so the engine adds the 1d10 to a failed
// save only when a use remains and spends the use *only if it rescues* the
// save — a use is never wasted. Modeled as a reroll with the DC reduced by the
// 1d10 (the same approximation Indomitable uses for its reroll), since the
// inline save path exposes pass/fail, not the raw total.

import type { Character } from '../types.js';
import { abilityMod } from './rulesEngine.js';
import { getClassLevel } from './multiclass.js';

/** Max Dark One's Own Luck uses — CHA mod (min 1) for a Fiend Warlock L6+,
 *  else 0. */
export function darkOnesLuckMaxUses(char: Character): number {
  if (!(char.subclass === 'fiend' && getClassLevel(char, 'warlock') >= 6)) return 0;
  return Math.max(1, abilityMod(char.cha));
}

/** Uses left this long rest. */
export function darkOnesLuckRemaining(char: Character): number {
  const used = char.class_resource_uses?.dark_ones_luck ?? 0;
  return Math.max(0, darkOnesLuckMaxUses(char) - used);
}

/** Spend one use (counts up from 0, like the other resource trackers). */
export function consumeDarkOnesLuck(char: Character): Character {
  return {
    ...char,
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      dark_ones_luck: (char.class_resource_uses?.dark_ones_luck ?? 0) + 1,
    },
  };
}

/**
 * Decide whether to spend a Dark One's Own Luck use on a save that failed.
 * `addLuck` is a thunk that re-rolls the save with the 1d10 folded in (DC
 * lowered by the roll) and returns whether it now meets the DC. Returns
 * `saved` (post-luck outcome) and `used` (true only when it rescued the save).
 */
export function tryDarkOnesLuck(
  char: Character,
  addLuck: () => boolean
): { saved: boolean; used: boolean } {
  if (darkOnesLuckRemaining(char) <= 0) return { saved: false, used: false };
  const passed = addLuck();
  return { saved: passed, used: passed };
}
