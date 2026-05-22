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

import { spellSlotsForCasterLevel, spellSlotsForClassLevel } from './rulesEngine.js';
import type { Character } from '../types.js';

// ─── Caster contributions (2024 PHB Ch. 1 multiclass spell-slot rule) ──────

const FULL_CASTERS = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);
const HALF_CASTERS = new Set(['paladin', 'ranger']);
// Third-casters depend on subclass — Fighter (Eldritch Knight) and Rogue
// (Arcane Trickster). The subclass check lives in `casterLevelContribution`.
const THIRD_CASTER_SUBCLASSES: Record<string, string> = {
  fighter: 'eldritch_knight',
  rogue: 'arcane_trickster',
};

/**
 * Caster-level contribution from `levelsInClass` levels in `className`,
 * given the optional `subclass` (relevant only for third-casters).
 *
 *   - Bard / Cleric / Druid / Sorcerer / Wizard → 1 × level
 *   - Paladin / Ranger                          → ⌊level / 2⌋
 *   - Fighter (Eldritch Knight)                 → ⌊level / 3⌋
 *   - Rogue (Arcane Trickster)                  → ⌊level / 3⌋
 *   - Warlock                                   → 0 (pact magic is separate)
 *   - Anyone else                               → 0
 */
function casterLevelContribution(
  className: string,
  levelsInClass: number,
  subclass?: string
): number {
  const cls = className.toLowerCase();
  if (FULL_CASTERS.has(cls)) return levelsInClass;
  if (HALF_CASTERS.has(cls)) return Math.floor(levelsInClass / 2);
  const reqSub = THIRD_CASTER_SUBCLASSES[cls];
  if (reqSub && subclass === reqSub) return Math.floor(levelsInClass / 3);
  return 0;
}

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

/**
 * Returns the spell-slot map (slot level → count) `char` has access to,
 * accounting for multiclass caster-level contributions (2024 PHB Ch. 1).
 *
 *   - Pure single-class: same answer as `spellSlotsForClassLevel`
 *     for that class (table-equivalent).
 *   - Pure warlock: pact slots from the warlock table.
 *   - Multi-class non-warlock: sum of caster contributions
 *     (full × 1; half ÷ 2; third ÷ 3 for Eldritch Knight / Arcane
 *     Trickster), looked up against the multiclass slot table.
 *   - Multi-class WITH warlock: multiclass slots from non-warlock
 *     contributions PLUS pact slots from warlock levels, **summed
 *     into one record at matching slot levels**. RAW treats these
 *     as two separate pools (you can cast a leveled spell with
 *     either kind of slot); the engine doesn't model that
 *     distinction yet, so the slots are merged. This is a known
 *     approximation — a Wizard 1 / Warlock 2 sums to 4 L1 slots
 *     (2 wizard + 2 warlock) instead of two pools of 2 each.
 *     Fix is deferred to a separate PR that splits pact vs
 *     multiclass slots in the Character schema.
 *
 * The pansori `subclass` field is a single string. For multiclass
 * PCs with a non-primary third-caster subclass (a Wizard 5 / Fighter
 * 3 Eldritch Knight), the subclass currently only applies to the
 * primary class — future-PR concern.
 */
export function spellSlotsForChar(char: Character): Record<number, number> {
  const levels = getClassLevels(char);
  const subclass = char.subclass;

  // Sum non-warlock caster contributions.
  let multiclassLevel = 0;
  let warlockLevels = 0;
  for (const [cls, lvl] of Object.entries(levels)) {
    if (cls === 'warlock') {
      warlockLevels += lvl;
      continue;
    }
    // Subclass only known for the primary class today.
    const sub = cls === char.character_class.toLowerCase() ? subclass : undefined;
    multiclassLevel += casterLevelContribution(cls, lvl, sub);
  }

  // Pure-warlock fast path — returns just the pact slot table.
  if (warlockLevels > 0 && multiclassLevel === 0) {
    return spellSlotsForClassLevel('warlock', warlockLevels);
  }

  // Non-warlock multiclass (or single-class caster). The contribution
  // sum IS the effective caster level — the table lookup is direct.
  const baseSlots = multiclassLevel > 0 ? spellSlotsForCasterLevel(multiclassLevel) : {};

  // Multi-class WITH warlock — merge pact slots into the multiclass map.
  // Known approximation; see function jsdoc.
  if (warlockLevels > 0) {
    const pact = spellSlotsForClassLevel('warlock', warlockLevels);
    const merged: Record<number, number> = { ...baseSlots };
    for (const [slotLvl, count] of Object.entries(pact)) {
      const k = Number(slotLvl);
      merged[k] = (merged[k] ?? 0) + count;
    }
    return merged;
  }

  return baseSlots;
}
