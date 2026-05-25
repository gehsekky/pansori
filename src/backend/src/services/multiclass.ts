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
  abilityMod,
  extraAttackCount,
  rageUsesMax,
  rollDice,
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
// Third-casters depend on subclass — pansori SRD-only build doesn't
// include any third-caster subclasses (Eldritch Knight / Arcane Trickster
// are PHB-only). Table kept as the integration shape for any future
// SRD third-caster work.
const THIRD_CASTER_SUBCLASSES: Record<string, string> = {};

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
 * 2024 PHB ritual-cast eligibility — Wizard / Cleric / Druid / Bard
 * can cast spells tagged `ritualCasting` as 10-minute rituals without
 * expending a slot. Warlock + Sorcerer have NO base ritual access
 * (Warlock RAW gets it only via Pact of the Tome + Book of Ancient
 * Secrets invocation; pansori defers that path). Paladin / Ranger
 * have no ritual access by RAW.
 */
export function canRitualCast(char: Character): boolean {
  return (
    hasClass(char, 'wizard') ||
    hasClass(char, 'cleric') ||
    hasClass(char, 'druid') ||
    hasClass(char, 'bard')
  );
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
 * SRD 5.2.1 Evasion (Rogue L7, Monk L7): on a Dexterity save-for-half
 * effect, take no damage on a success and half on a failure. Unavailable
 * while Incapacitated. (RE-2.)
 */
export function hasEvasion(char: Character): boolean {
  if ((char.conditions ?? []).includes('incapacitated')) return false;
  return getClassLevel(char, 'rogue') >= 7 || getClassLevel(char, 'monk') >= 7;
}

/**
 * SRD 5.2.1 Reliable Talent (Rogue L7): on an ability check that uses one of
 * the rogue's skill or tool proficiencies, treat a d20 of 9 or lower as a 10.
 * Passive, with no incapacitation gate (it's not an action or reaction). The
 * proficiency requirement is enforced at the `skillCheck` call. (RE-2.)
 */
export function hasReliableTalent(char: Character): boolean {
  return getClassLevel(char, 'rogue') >= 7;
}

/**
 * SRD 5.2.1 Slippery Mind (Rogue L15): the rogue gains proficiency in Wisdom
 * and Charisma saving throws. Applied at the `hasSaveProficiency` site so it
 * flows through every save path that consults it. (RE-2.)
 */
export function hasSlipperyMind(char: Character): boolean {
  return getClassLevel(char, 'rogue') >= 15;
}

/**
 * SRD 5.2.1 Disciplined Survivor (Monk L14): proficiency in all saving throws.
 * (Also lets the monk spend a Focus Point to reroll a failed save — that
 * ki-reroll half is deferred; see docs/TODO.md.) Applied at `hasSaveProficiency`.
 * (RE-2.)
 */
export function hasDisciplinedSurvivor(char: Character): boolean {
  return getClassLevel(char, 'monk') >= 14;
}

/**
 * SRD 5.2.1 Elusive (Rogue L18): no attack roll can have Advantage against the
 * rogue unless they have the Incapacitated condition. Returns true when the
 * feature is actively suppressing incoming advantage — Rogue L18+ and not under
 * any condition that imposes Incapacitated (paralyzed / stunned / unconscious /
 * petrified all do, so they switch the protection off, matching the conditions
 * that would otherwise grant attackers advantage). (RE-2.)
 */
export function hasElusive(char: Character): boolean {
  const incapacitated = (char.conditions ?? []).some((c) =>
    ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
  );
  if (incapacitated) return false;
  return getClassLevel(char, 'rogue') >= 18;
}

/**
 * SRD 5.2.1 Jack of All Trades (Bard L2): add half the proficiency bonus
 * (round down) to any ability check that uses a skill the bard is NOT
 * proficient in. `skillCheck` applies the half-prof when its `jackOfAllTrades`
 * flag is set and the check is non-proficient. (RE-2.)
 */
export function hasJackOfAllTrades(char: Character): boolean {
  return getClassLevel(char, 'bard') >= 2;
}

/**
 * SRD 5.2.1 Words of Creation (Bard L20 capstone): the bard always has Power
 * Word Heal and Power Word Kill prepared, and when casting either may target a
 * second creature within 10 ft of the first. This predicate drives that
 * dual-target rider in the cast pipeline. (RE-2.)
 */
export function hasWordsOfCreation(char: Character): boolean {
  return getClassLevel(char, 'bard') >= 20;
}

/**
 * SRD 5.2.1 Expertise (Rogue L1 + L6, Bard L2 + L9): the number of skills the
 * character may hold Expertise in (double proficiency bonus). Each class grants
 * 2 then 2 more; multiclass grants are independent, so they sum. (RE-2.)
 */
export function expertiseSlots(char: Character): number {
  const bard = getClassLevel(char, 'bard');
  const rogue = getClassLevel(char, 'rogue');
  const bardSlots = bard >= 9 ? 4 : bard >= 2 ? 2 : 0;
  const rogueSlots = rogue >= 6 ? 4 : rogue >= 1 ? 2 : 0;
  return bardSlots + rogueSlots;
}

/**
 * True when `char` has chosen Expertise in `skill` (case-insensitive). The
 * doubled proficiency is applied by `skillCheck` when it is also proficient. (RE-2.)
 */
export function hasExpertise(char: Character, skill: string): boolean {
  return (char.expertise_skills ?? []).some((s) => s.toLowerCase() === skill.toLowerCase());
}

/**
 * SRD 5.2.1 Countercharm (Bard L7): when a creature within 30 ft fails a save
 * against an effect applying Charmed or Frightened, the bard may use a Reaction
 * to make that creature reroll with Advantage. This predicate gates the bard
 * (the reactor): Bard L7+, a reaction still available, and not Incapacitated
 * (incl. the conditions that impose it). The 30-ft range + condition check live
 * at the save site. (RE-2.)
 */
export function canCountercharm(char: Character): boolean {
  if (char.turn_actions?.reaction_used) return false;
  if (
    (char.conditions ?? []).some((c) =>
      ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
    )
  ) {
    return false;
  }
  return getClassLevel(char, 'bard') >= 7;
}

/**
 * SRD 5.2.1 Superior Inspiration (Bard L18): when you roll Initiative, regain
 * expended uses of Bardic Inspiration until you have two (if you have fewer).
 * Returns the char with `class_resource_uses.bardic_inspiration` topped up to
 * `min(2, max)` — capped at the bard's normal maximum (CHA mod, min 1), since
 * it regains *expended* uses. No-op below L18 or when already at/above the
 * target. (RE-2.)
 */
/**
 * SRD 5.2.1 Danger Sense (Barbarian L2): Advantage on Dexterity saving throws
 * unless Incapacitated (incl. the conditions that impose it). Applied wherever
 * the barbarian rolls a DEX save. (RE-2.)
 */
/**
 * SRD 5.2.1 Indomitable Might (Barbarian L18): if your total for a Strength
 * check is less than your Strength score, use the score in place of the total.
 * Returns the floored total; a no-op below L18. (RE-2.)
 */
export function applyIndomitableMight(char: Character, strCheckTotal: number): number {
  return getClassLevel(char, 'barbarian') >= 18 ? Math.max(strCheckTotal, char.str) : strCheckTotal;
}

/**
 * SRD Ranger Hunter "feature option" picks. Each Hunter's-Prey-style feature
 * grants ONE of two options at the gate level, swappable on a rest. The picker
 * (`choose_hunter_option`) + generateChoices read these definitions. (RE-2.)
 */
export const hunterFeatureOptions: Record<
  'hunters_prey' | 'defensive_tactics',
  { feature: string; level: number; options: string[]; labels: Record<string, string> }
> = {
  hunters_prey: {
    feature: "Hunter's Prey",
    level: 3,
    options: ['colossus_slayer', 'horde_breaker'],
    labels: {
      colossus_slayer: 'Colossus Slayer — +1d8 once/turn vs a wounded foe',
      horde_breaker: 'Horde Breaker — once/turn, an extra attack vs a nearby foe',
    },
  },
  defensive_tactics: {
    feature: 'Defensive Tactics',
    level: 7,
    options: ['escape_the_horde', 'multiattack_defense'],
    labels: {
      escape_the_horde: 'Escape the Horde — opportunity attacks vs you have disadvantage',
      multiattack_defense: "Multiattack Defense — an attacker that hits you has disadvantage on its other attacks vs you",
    },
  },
};

/** The Hunter's Prey option in effect (defaults to colossus_slayer, the
 *  pre-picker behavior). Only meaningful for a Hunter Ranger. */
export function huntersPrey(char: Character): 'colossus_slayer' | 'horde_breaker' {
  return char.hunters_prey ?? 'colossus_slayer';
}

/** SRD Ranger Defensive Tactics (L7) — Escape the Horde: opportunity attacks
 *  against you have Disadvantage. */
export function hasEscapeTheHorde(char: Character): boolean {
  return (
    char.subclass === 'hunter' &&
    getClassLevel(char, 'ranger') >= 7 &&
    char.defensive_tactics === 'escape_the_horde'
  );
}

/** SRD Ranger Defensive Tactics (L7) — Multiattack Defense: a creature that
 *  hits you has Disadvantage on its other attack rolls against you this turn. */
export function hasMultiattackDefense(char: Character): boolean {
  return (
    char.subclass === 'hunter' &&
    getClassLevel(char, 'ranger') >= 7 &&
    char.defensive_tactics === 'multiattack_defense'
  );
}

/** SRD Ranger Superior Hunter's Defense (L15) — a Reaction grants Resistance to
 *  the triggering damage type until the end of the turn. Only Hunter Rangers. */
export function hasSuperiorHuntersDefense(char: Character): boolean {
  return char.subclass === 'hunter' && getClassLevel(char, 'ranger') >= 15;
}

/**
 * SRD Sorcerer Metamagic options the player can learn + use. Each maps the
 * short id (stored in `metamagics_known` and `metamagic_active`) to its label
 * and Sorcery-Point cost. All ten SRD options are present + functional. (RE-2.)
 */
export const metamagicOptions: Record<string, { label: string; cost: number }> = {
  careful: { label: 'Careful Spell', cost: 1 },
  distant: { label: 'Distant Spell', cost: 1 },
  empowered: { label: 'Empowered Spell', cost: 1 },
  extended: { label: 'Extended Spell', cost: 1 },
  heightened: { label: 'Heightened Spell', cost: 2 },
  quickened: { label: 'Quickened Spell', cost: 2 },
  seeking: { label: 'Seeking Spell', cost: 1 },
  subtle: { label: 'Subtle Spell', cost: 1 },
  transmuted: { label: 'Transmuted Spell', cost: 1 },
  twinned: { label: 'Twinned Spell', cost: 1 },
};

/** SRD Sorcerer Metamagic — number of options known: 2 at L2, +2 at L10, +2 at
 *  L17 (multiclass uses the Sorcerer level). */
export function metamagicSlots(char: Character): number {
  const lvl = getClassLevel(char, 'sorcerer');
  return lvl >= 17 ? 6 : lvl >= 10 ? 4 : lvl >= 2 ? 2 : 0;
}

/** True when the Sorcerer has learned the given Metamagic option id. */
export function knowsMetamagic(char: Character, id: string): boolean {
  return (char.metamagics_known ?? []).includes(id);
}

export function hasDangerSense(char: Character): boolean {
  if (
    (char.conditions ?? []).some((c) =>
      ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
    )
  ) {
    return false;
  }
  return getClassLevel(char, 'barbarian') >= 2;
}

/**
 * SRD 5.2.1 Persistent Rage (Barbarian L15): when you roll Initiative, you can
 * regain all expended uses of Rage (once per long rest). Returns the char with
 * `rage_uses` refreshed to max + a `persistent_rage_used` flag, only when uses
 * are actually expended and the feature hasn't been used since the last long
 * rest. (The "Rage lasts 10 minutes" clause is already pansori's behavior —
 * Rage persists for the encounter.) No-op below L15. (RE-2.)
 */
export function persistentRageTopUp(char: Character): Character {
  if (getClassLevel(char, 'barbarian') < 15) return char;
  if (char.class_resource_uses?.persistent_rage_used) return char;
  const max = rageUsesMax(getClassLevel(char, 'barbarian'));
  const current = char.class_resource_uses?.rage_uses ?? max;
  if (current >= max) return char; // nothing expended — don't burn the once-per-rest refresh
  return {
    ...char,
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      rage_uses: max,
      persistent_rage_used: 1,
    },
  };
}

/**
 * SRD 5.2.1 Uncanny Metabolism (Monk L2): when you roll Initiative, regain all
 * expended Focus Points (ki) and heal Monk level + a Martial Arts die roll.
 * Once per long rest. Applied in runCombatStart. Only fires when there's
 * something to regain (expended ki or missing HP), so the once-per-rest use
 * isn't wasted. No-op below L2. (RE-2.)
 */
export function uncannyMetabolismRefresh(char: Character): Character {
  const monk = getClassLevel(char, 'monk');
  if (monk < 2) return char;
  if (char.class_resource_uses?.uncanny_metabolism_used) return char;
  const kiMax = monk;
  const kiCurrent = char.class_resource_uses?.ki_points ?? kiMax;
  const injured = char.hp < char.max_hp;
  if (kiCurrent >= kiMax && !injured) return char; // nothing to regain
  const die = monk >= 17 ? 12 : monk >= 11 ? 10 : monk >= 5 ? 8 : 6;
  const heal = monk + rollDice(`1d${die}`);
  return {
    ...char,
    hp: Math.min(char.max_hp, char.hp + heal),
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      ki_points: kiMax,
      uncanny_metabolism_used: 1,
    },
  };
}

/**
 * SRD 5.2.1 Perfect Focus (Monk L15): when you roll Initiative and don't use
 * Uncanny Metabolism, regain Focus Points until you have 4 (if you have 3 or
 * fewer). Applied in runCombatStart AFTER `uncannyMetabolismRefresh` — if that
 * fired, ki is already at max (≥4 at L15+), so the `> 3` gate here makes this a
 * no-op, which is exactly the "don't use Uncanny Metabolism" fallback. No-op
 * below L15. (RE-2.)
 */
export function perfectFocusRefresh(char: Character): Character {
  if (getClassLevel(char, 'monk') < 15) return char;
  const current = char.class_resource_uses?.ki_points ?? getClassLevel(char, 'monk');
  if (current > 3) return char;
  return {
    ...char,
    class_resource_uses: { ...(char.class_resource_uses ?? {}), ki_points: 4 },
  };
}

export function superiorInspirationTopUp(char: Character): Character {
  if (getClassLevel(char, 'bard') < 18) return char;
  const max = Math.max(1, abilityMod(char.cha));
  const current = char.class_resource_uses?.bardic_inspiration ?? max;
  const target = Math.min(2, max);
  if (current >= target) return char;
  return {
    ...char,
    class_resource_uses: { ...(char.class_resource_uses ?? {}), bardic_inspiration: target },
  };
}

/**
 * SRD 5.2.1 Paladin Lay on Hands (L1): HP remaining in the healing pool —
 * 5 × Paladin level minus points already spent (`class_resource_uses
 * .lay_on_hands`, replenished on a long rest). 0 for non-paladins. (RE-2.)
 */
export function layOnHandsRemaining(char: Character): number {
  const max = getClassLevel(char, 'paladin') * 5;
  const used = char.class_resource_uses?.lay_on_hands ?? 0;
  return Math.max(0, max - used);
}

/**
 * SRD 5.2.1 Fighter Indomitable (L9): the number of failed-save rerolls
 * available before a long rest — 1 at L9, 2 at L13, 3 at L17. 0 for a
 * character with no Fighter levels. (RE-2.)
 */
export function indomitableMaxUses(char: Character): number {
  const lvl = getClassLevel(char, 'fighter');
  return lvl >= 17 ? 3 : lvl >= 13 ? 2 : lvl >= 9 ? 1 : 0;
}

/**
 * Rerolls left this long rest (max minus `class_resource_uses.indomitable`,
 * the count of uses spent). (RE-2.)
 */
export function indomitableRemaining(char: Character): number {
  const used = char.class_resource_uses?.indomitable ?? 0;
  return Math.max(0, indomitableMaxUses(char) - used);
}

// Maps a class to the spell list(s) it draws from. Used to match a
// PC's classes against a spell's `spellList` tag so multiclass
// casters can use the right casting ability per spell.
const CLASS_SPELL_LISTS: Record<string, Array<'arcane' | 'divine' | 'primal'>> = {
  wizard: ['arcane'],
  sorcerer: ['arcane'],
  warlock: ['arcane'],
  bard: ['arcane'],
  cleric: ['divine'],
  paladin: ['divine'],
  druid: ['primal'],
  ranger: ['primal'],
};

/**
 * Multiclass spell-casting ability resolver (2024 PHB).
 *
 * RAW: when a multiclass spellcaster casts a spell, they use the
 * casting ability of the class whose spell list grants access to
 * it. Pansori auto-picks the best ability for the player —
 * iterating through the PC's caster classes, keeping any whose
 * spell-list overlaps the spell's tags, and picking the one with
 * the highest modifier.
 *
 * `spellLists` is the spell's `spellList` field (e.g. `['arcane',
 * 'divine', 'primal']` for Cure Wounds). If the spell has no
 * spellList tag (legacy spells) or no class match, falls back to
 * the PC's primary-class casting ability.
 *
 * Returns the chosen AbilityKey ('int' | 'wis' | 'cha' | ...).
 */
export function resolveCastingAbility(
  char: Character,
  spellLists: ReadonlyArray<'arcane' | 'divine' | 'primal'> | undefined,
  spellcastingAbilityTable: Record<string, string>,
  fallback: string
): string {
  if (!spellLists || spellLists.length === 0) return fallback;
  const classLevels = getClassLevels(char);
  // Two-pass: first find all classes whose spell list overlaps the
  // spell's tags. If any do, pick the one with the highest casting-
  // ability mod among the matching classes. If none match, fall back
  // to the primary-class ability (RAW: a non-caster casting via a
  // feat-granted spell uses their primary ability).
  let bestAbility: string | undefined;
  let bestMod = -Infinity;
  for (const cls of Object.keys(classLevels)) {
    const lists = CLASS_SPELL_LISTS[cls.toLowerCase()] ?? [];
    const overlap = lists.some((l) => spellLists.includes(l));
    if (!overlap) continue;
    // Try both lowercase and capitalized keys — pansori's
    // spellcastingAbility table uses capitalized class names.
    const ability =
      spellcastingAbilityTable[cls] ??
      spellcastingAbilityTable[cls.charAt(0).toUpperCase() + cls.slice(1)];
    if (!ability) continue;
    const score = ((char as unknown as Record<string, number>)[ability] ?? 10) as number;
    const mod = Math.floor((score - 10) / 2);
    if (mod > bestMod) {
      bestMod = mod;
      bestAbility = ability;
    }
  }
  return bestAbility ?? fallback;
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
