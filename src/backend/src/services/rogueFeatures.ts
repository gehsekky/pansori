import type { Character } from '../types.js';
import type { InitEntry } from './gameEngine.js';
import { getClassLevel } from './multiclass.js';

// SRD: Rogue class features that read off character / combat state.

/** SRD Thief's Reflexes — a Thief Rogue of level 17+. */
export function hasThiefsReflexes(char: Character): boolean {
  return char.subclass === 'thief' && getClassLevel(char, 'rogue') >= 17;
}

/**
 * SRD Thief's Reflexes (Thief L17) — two turns in the first round of any
 * combat: the normal one, and a second at Initiative − 10. Adds that second
 * slot (tagged `extra_turn_round` = the combat's first round, so the turn loop
 * passes over and then drops it once that round ends) after every entry with
 * an equal or higher roll.
 */
export function withThiefsReflexes(
  order: InitEntry[],
  chars: Character[],
  round: number
): InitEntry[] {
  let out = order;
  for (const c of chars) {
    if (c.dead || !hasThiefsReflexes(c)) continue;
    const first = out.find((e) => e.id === c.id && e.extra_turn_round === undefined);
    if (!first) continue;
    const extra: InitEntry = {
      id: c.id,
      roll: first.roll - 10,
      is_enemy: false,
      extra_turn_round: round,
    };
    const at = out.findIndex((e) => e.roll < extra.roll);
    out = at < 0 ? [...out, extra] : [...out.slice(0, at), extra, ...out.slice(at)];
  }
  return out;
}
