// SRD Boon of Fate (epic boon, L19+) — Improve Fate. "When you or another
// creature within 60 feet of you succeeds on or fails a D20 Test, you can roll
// 2d4 and apply the total rolled as a bonus or penalty to the d20 roll. Once
// you use this benefit, you can't use it again until you roll Initiative or
// finish a Short or Long Rest."
//
// Auto-resolve policy (mirrors Dark One's Own Luck / Indomitable): inline saves
// expose pass/fail, not the raw total, so the engine adds the 2d4 to a failed
// saving throw only when it rescues the save, spending the once-per-rest use
// *only if it rescues* — never wasted. Modeled as a reroll with the DC lowered
// by the 2d4 total.
//
// Scope: pansori wires Improve Fate to the holder's own failed saving throw —
// the highest-value D20 Test the auto-resolve path can express. RAW also lets
// it touch ability checks and attack rolls, apply to a creature within 60 ft,
// and be used as a *penalty* against an enemy; those surfaces aren't modeled.

import type { Character } from '../types.js';

/** True when the PC holds Boon of Fate and hasn't spent Improve Fate since the
 *  last Initiative roll / Short or Long Rest. */
export function improveFateAvailable(char: Character): boolean {
  return (
    (char.feats ?? []).includes('boon_fate') && !(char.class_resource_uses?.improve_fate_used ?? 0)
  );
}

/** SRD Boon of Fate — Improve Fate recharges when you roll Initiative. Clears
 *  the spent flag at combat start (no-op without the boon / when unspent). */
export function improveFateRefresh(char: Character): Character {
  if (!(char.feats ?? []).includes('boon_fate') || !char.class_resource_uses?.improve_fate_used) {
    return char;
  }
  const next = { ...(char.class_resource_uses ?? {}) };
  delete next.improve_fate_used;
  return { ...char, class_resource_uses: next };
}

/** Mark Improve Fate spent (reset on Initiative / Short / Long Rest). */
export function consumeImproveFate(char: Character): Character {
  return {
    ...char,
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      improve_fate_used: 1,
    },
  };
}

/**
 * Decide whether to spend Improve Fate on a save that failed. `addFate` is a
 * thunk that re-rolls the save with the 2d4 folded in (DC lowered by the roll)
 * and returns whether it now meets the DC. Returns `saved` (post-fate outcome)
 * and `used` (true only when it rescued the save).
 */
export function tryImproveFate(
  char: Character,
  addFate: () => boolean
): { saved: boolean; used: boolean } {
  if (!improveFateAvailable(char)) return { saved: false, used: false };
  const passed = addFate();
  return { saved: passed, used: passed };
}
