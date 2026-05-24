// SRD 5.2.1 — Rogue Stroke of Luck (L20). "If you fail a D20 Test, you can turn
// the roll into a 20. Once you use this feature, you can't use it again until
// you finish a Short or Long Rest." A D20 Test is an attack roll, an ability
// check, or a saving throw — so this is wired into all three. Tracked as used
// (0/1) on `class_resource_uses.stroke_of_luck`, reset on a short or long rest.
//
// Auto-resolve policy (player-favorable, matching Indomitable): saves/checks/
// attacks resolve inline with no interactive "use it now?" prompt, so the
// engine applies Stroke of Luck on the first failed D20 Test where turning the
// die into a 20 changes failure into success, and spends the single use then.
// Since it only fires on an already-failed test, it never costs the player a
// worse outcome. A future pass can surface it as an interactive choice so the
// player controls the timing (tracked in docs/TODO.md).

import type { Character } from '../types.js';
import { getClassLevel } from './multiclass.js';

// L20 Rogue with the once-per-rest use still available.
export function strokeOfLuckAvailable(char: Character): boolean {
  return getClassLevel(char, 'rogue') >= 20 && (char.class_resource_uses?.stroke_of_luck ?? 0) < 1;
}

// Spend the single use (immutable; reset on short/long rest in rest.ts).
export function consumeStrokeOfLuck(char: Character): Character {
  return {
    ...char,
    class_resource_uses: { ...(char.class_resource_uses ?? {}), stroke_of_luck: 1 },
  };
}
