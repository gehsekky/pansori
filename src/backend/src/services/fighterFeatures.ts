import type { Character } from '../types.js';
import { getClassLevel } from './multiclass.js';

/** SRD Fighter Second Wind uses per rest — 2 / 3 / 4 at Fighter L1 / 4 / 10. */
export function secondWindMax(char: Character): number {
  const lvl = getClassLevel(char, 'fighter');
  if (lvl < 1) return 0;
  return lvl >= 10 ? 4 : lvl >= 4 ? 3 : 2;
}

/** Second Wind uses left before the next rest. */
export function secondWindRemaining(char: Character): number {
  return Math.max(0, secondWindMax(char) - (char.class_resource_uses?.second_wind ?? 0));
}

/** The character with one Second Wind use spent. */
export function spendSecondWind(char: Character): Character {
  return {
    ...char,
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      second_wind: (char.class_resource_uses?.second_wind ?? 0) + 1,
    },
  };
}

/**
 * SRD Fighter Tactical Mind (L2) — after failing an ability check, spend a
 * Second Wind use to roll 1d10 and add it to the check; if the check still
 * fails, the use isn't expended.
 *
 * pansori auto-applies it (the same policy as Peerless Skill): on a failed
 * check with a use left, the d10 is rolled; it's added and the use spent only
 * when it turns the failure into a success. `rollD10` is injectable for tests.
 */
export function tacticalMindRescue(
  char: Character,
  total: number,
  dc: number,
  rollD10: () => number = () => Math.floor(Math.random() * 10) + 1
): { rescued: boolean; roll: number; total: number } {
  if (total >= dc) return { rescued: false, roll: 0, total };
  if (getClassLevel(char, 'fighter') < 2 || secondWindRemaining(char) <= 0) {
    return { rescued: false, roll: 0, total };
  }
  const roll = rollD10();
  if (total + roll < dc) return { rescued: false, roll, total };
  return { rescued: true, roll, total: total + roll };
}

/**
 * SRD Fighter Tactical Shift (L5) — activating Second Wind with a Bonus Action
 * lets you move up to half your Speed without provoking Opportunity Attacks.
 * Returns the free-movement budget in feet (0 below Fighter 5).
 */
export function tacticalShiftFeet(char: Character, speedFt: number): number {
  if (getClassLevel(char, 'fighter') < 5) return 0;
  return Math.floor(speedFt / 2 / 5) * 5;
}

/**
 * Apply Tactical Mind to a check result on a given character. Returns the
 * (possibly) updated character — one Second Wind use spent on a rescue — the
 * updated check, and a narrative note ('' when nothing happened).
 */
export function applyTacticalMindTo<T extends { total: number; success: boolean }>(
  char: Character,
  check: T,
  dc: number,
  rollD10?: () => number
): { char: Character; check: T; note: string } {
  if (check.success) return { char, check, note: '' };
  const res = tacticalMindRescue(char, check.total, dc, rollD10);
  if (!res.rescued) return { char, check, note: '' };
  return {
    char: spendSecondWind(char),
    check: { ...check, total: res.total, success: true },
    note: ` ✦ Tactical Mind: ${char.name} spends a Second Wind — +${res.roll}, turning the check into a success (${res.total}).`,
  };
}
