// Multiclassing helpers (2024 PHB Ch. 1).
//
// This module is the **read-side type seam** for multiclass support.
// It exposes `class_levels` lookups in a way that handles legacy
// single-class characters (where `class_levels` is unset) by deriving
// the breakdown from `character_class` + `level`.
//
// The seam exists ahead of behavior migration so call sites can
// progressively flip from `char.level + char.character_class` to
// these helpers without coordinating a flag-day cutover. Spell-slot
// calc, prereq checks, ASI gating, and feature gating each migrate
// in their own PR. See docs/TODO.md "Multiclassing" for the roadmap.
//
// Invariants:
//   - Class names in `class_levels` keys are lowercased.
//   - Sum of values in `class_levels` equals `char.level` for
//     well-formed multiclass PCs (single-class is trivially true).
//   - `character_class` is always the **first** class (taken at
//     creation). Saving-throw profs are derived from this class
//     only — that rule stays once the prereq + spell-slot PRs land.

import type { Character } from '../types.js';

/**
 * Returns the per-class level breakdown for `char`. If
 * `class_levels` is explicitly set, returns it as-is. Otherwise
 * synthesizes a single-class breakdown from `character_class` +
 * `level` (lower-casing the class name for the key).
 *
 * **Never mutates `char`.** The synthesized object is a fresh
 * record; callers can treat the return value as immutable.
 */
export function getClassLevels(char: Character): Record<string, number> {
  if (char.class_levels && Object.keys(char.class_levels).length > 0) {
    return char.class_levels;
  }
  // Legacy single-class derivation. Lower-case the key to match the
  // multiclass convention (FE display still uses `character_class`).
  return { [char.character_class.toLowerCase()]: char.level ?? 1 };
}

/**
 * Returns the number of levels `char` has in `className`
 * (case-insensitive). Zero when `char` has no levels in that class.
 */
export function getClassLevel(char: Character, className: string): number {
  const levels = getClassLevels(char);
  return levels[className.toLowerCase()] ?? 0;
}

/**
 * True when `char` has at least one level in `className`
 * (case-insensitive). Use for feature-gating predicates that
 * previously read `char.character_class === 'X'` — multiclass
 * characters with even 1 level in X qualify for that class's
 * features at their per-class level.
 */
export function hasClass(char: Character, className: string): boolean {
  return getClassLevel(char, className) > 0;
}

/**
 * Returns the character's total level (== sum of all class levels).
 * For single-class characters this is `char.level`. For multiclass
 * the sum derived from `class_levels` should agree with `char.level`
 * — divergence indicates a bookkeeping bug at level-up time.
 */
export function getTotalLevel(char: Character): number {
  const levels = getClassLevels(char);
  let total = 0;
  for (const v of Object.values(levels)) total += v;
  return total;
}

/**
 * Returns the lowercased list of class names `char` has levels in,
 * in insertion order (first class taken → most-recently-added).
 * Useful for narrative-attribution + UX layouts that show one badge
 * per class.
 */
export function getAllClasses(char: Character): string[] {
  return Object.keys(getClassLevels(char));
}

/**
 * Returns `char.character_class` lower-cased (the primary / first
 * class). Centralized so callers don't independently re-implement
 * the lowercase coercion. Used for tie-breaking rules that depend
 * specifically on the first class:
 *
 *   - 2024 PHB: saving-throw proficiencies come from the FIRST class only.
 *   - 2024 PHB: when a class feature exists on multiple classes the
 *     PC has, the first-class version usually wins.
 */
export function getPrimaryClass(char: Character): string {
  return char.character_class.toLowerCase();
}
