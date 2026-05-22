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

import {
  extraAttackCount,
  spellSlotsForCasterLevel,
  spellSlotsForClassLevel,
} from './rulesEngine.js';
import type { Character } from '../types.js';

// ─── Multiclass proficiency grants (2024 PHB Ch. 1) ────────────────────────

/**
 * Armor + weapon proficiencies granted on multiclass entry (the FIRST
 * level taken in a non-primary class). RAW 2024 PHB grants a narrow
 * subset — not the full class loadout. Skill / tool / instrument
 * choices are listed for some classes (Bard, Ranger, Rogue) and need
 * a player chooser; deferred to the level-up UX PR.
 *
 * Source classes that grant *no* multiclass props (Sorcerer, Wizard)
 * are absent from the table; `applyMulticlassProfGrants` is a no-op
 * for them.
 */
type ProfGrant = {
  armor?: string[]; // 'light' | 'medium' | 'shield'
  weapon?: string[]; // 'simple' | 'martial' | 'martial-light'
};

const MULTICLASS_PROF_GRANTS: Record<string, ProfGrant> = {
  barbarian: { armor: ['shield'], weapon: ['simple', 'martial'] },
  bard: { armor: ['light'] },
  cleric: { armor: ['light', 'medium', 'shield'] },
  druid: { armor: ['light', 'medium', 'shield'] },
  fighter: { armor: ['light', 'medium', 'shield'], weapon: ['simple', 'martial'] },
  // Monk multiclass entry grants simple weapons + martial weapons that
  // have the Light property. The Light-only restriction isn't currently
  // modeled by the weapon-proficiency strings; treating it as 'simple'
  // only is more conservative than RAW (slightly under-grants).
  monk: { weapon: ['simple'] },
  paladin: { armor: ['light', 'medium', 'shield'], weapon: ['simple', 'martial'] },
  ranger: { armor: ['light', 'medium', 'shield'], weapon: ['simple', 'martial'] },
  rogue: { armor: ['light'] },
  warlock: { armor: ['light'], weapon: ['simple'] },
};

/**
 * Apply the 2024 PHB multiclass proficiency grants to `char` for
 * a first level in `className`. Mutates `char` in place (adds
 * proficiencies that aren't already present). Returns a human-
 * readable note for the level-up narrative, or empty if nothing
 * was granted.
 */
export function applyMulticlassProfGrants(char: Character, className: string): string {
  const grant = MULTICLASS_PROF_GRANTS[className.toLowerCase()];
  if (!grant) return '';
  const added: string[] = [];
  if (grant.armor) {
    const existing = new Set(char.armor_proficiencies ?? []);
    for (const a of grant.armor) {
      if (!existing.has(a)) {
        existing.add(a);
        added.push(`${a} armor`);
      }
    }
    char.armor_proficiencies = [...existing];
  }
  if (grant.weapon) {
    const existing = new Set(char.weapon_proficiencies ?? []);
    for (const w of grant.weapon) {
      if (!existing.has(w)) {
        existing.add(w);
        added.push(`${w} weapons`);
      }
    }
    char.weapon_proficiencies = [...existing];
  }
  if (added.length === 0) return '';
  return ` Multiclass proficiency: ${added.join(', ')}.`;
}

// ─── Multiclass prerequisites (2024 PHB Ch. 1) ─────────────────────────────

/**
 * Minimum ability scores required to take a level in each class as
 * a multiclass option. Values are pulled directly from 2024 PHB Ch. 1
 * "Multiclassing — Prerequisites" — every entry is an AND across the
 * listed pairs (`Paladin` needs STR 13 AND CHA 13; `Fighter` is the
 * one OR — STR 13 OR DEX 13 — modeled below as the `or` variant).
 *
 * These ARE NOT applied at character creation — the first class is
 * always free of prereqs (that's RAW: prereqs gate multiclassing in,
 * not character generation). Used by `canMulticlassInto` which runs
 * at level-up time when the player picks a second class.
 */
type AbilityRequirement =
  | { kind: 'and'; abilities: Array<['str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number]> }
  | { kind: 'or'; abilities: Array<['str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number]> };

const MULTICLASS_PREREQS: Record<string, AbilityRequirement> = {
  barbarian: { kind: 'and', abilities: [['str', 13]] },
  bard: { kind: 'and', abilities: [['cha', 13]] },
  cleric: { kind: 'and', abilities: [['wis', 13]] },
  druid: { kind: 'and', abilities: [['wis', 13]] },
  fighter: {
    kind: 'or',
    abilities: [
      ['str', 13],
      ['dex', 13],
    ],
  },
  monk: {
    kind: 'and',
    abilities: [
      ['dex', 13],
      ['wis', 13],
    ],
  },
  paladin: {
    kind: 'and',
    abilities: [
      ['str', 13],
      ['cha', 13],
    ],
  },
  ranger: {
    kind: 'and',
    abilities: [
      ['dex', 13],
      ['wis', 13],
    ],
  },
  rogue: { kind: 'and', abilities: [['dex', 13]] },
  sorcerer: { kind: 'and', abilities: [['cha', 13]] },
  warlock: { kind: 'and', abilities: [['cha', 13]] },
  wizard: { kind: 'and', abilities: [['int', 13]] },
};

/**
 * Checks whether `char` meets the 2024 PHB multiclass prerequisites
 * for `targetClass` (case-insensitive). Returns an empty string on
 * success or a human-readable reason on failure (mirrors the
 * `canTakeFeat` shape — callers short-circuit on truthy returns).
 *
 *   - First-class checks (`char.character_class === targetClass`)
 *     return empty since the first class has no prereq per RAW.
 *   - Unknown classes return an unknown-class error.
 *
 * Does NOT validate that the level-up itself is legal (level cap,
 * XP, etc.) — that's the level-up handler's responsibility.
 */
export function canMulticlassInto(char: Character, targetClass: string): string {
  const cls = targetClass.toLowerCase();
  if (cls === char.character_class.toLowerCase()) {
    // Continuing in the first class — never a multiclass-prereq concern.
    return '';
  }
  const req = MULTICLASS_PREREQS[cls];
  if (!req) {
    return `${targetClass} is not a known class.`;
  }
  const scoreOf = (ab: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'): number =>
    (char[ab] ?? 10) as number;
  if (req.kind === 'and') {
    for (const [ab, min] of req.abilities) {
      if (scoreOf(ab) < min) {
        return `Multiclassing into ${targetClass} requires ${ab.toUpperCase()} ${min} (${char.name}'s ${ab.toUpperCase()} is ${scoreOf(ab)}).`;
      }
    }
    return '';
  }
  // 'or' — only Fighter today (STR 13 OR DEX 13).
  const passes = req.abilities.some(([ab, min]) => scoreOf(ab) >= min);
  if (passes) return '';
  const reqList = req.abilities.map(([ab, min]) => `${ab.toUpperCase()} ${min}`).join(' or ');
  return `Multiclassing into ${targetClass} requires ${reqList}.`;
}

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
 * 2024 PHB Multiclassing — Extra Attack: "If you gain the Extra
 * Attack feature from more than one class, the features don't add
 * together." Take the maximum extraAttackCount across all classes
 * the PC has levels in. A Fighter 4 / Ranger 4 (total 8) gets 0
 * extras (neither class hit L5 yet, and the helper doesn't look at
 * total level). A Fighter 5 / Wizard 10 (total 15) gets 1 extra
 * (Fighter L5 = +1; Wizard doesn't contribute).
 */
export function extraAttackCountForChar(char: Character): number {
  let best = 0;
  for (const [cls, lvl] of Object.entries(getClassLevels(char))) {
    const cnt = extraAttackCount(cls, lvl);
    if (cnt > best) best = cnt;
  }
  return best;
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
