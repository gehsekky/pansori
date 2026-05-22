// Tests for the multiclass read-side type seam. The helpers must:
//   - work transparently on legacy single-class characters
//     (`class_levels` unset) by synthesizing the breakdown from
//     `character_class` + `level`,
//   - return the stored breakdown verbatim when `class_levels` is
//     set,
//   - lower-case class names on lookup so callers don't have to.

import { describe, expect, it } from 'vitest';
import {
  getAllClasses,
  getClassLevel,
  getClassLevels,
  getPrimaryClass,
  getTotalLevel,
  hasClass,
  spellSlotsForChar,
} from './multiclass.js';
import { makeChar } from '../test-fixtures.js';
import { spellSlotsForClassLevel } from './rulesEngine.js';

describe('getClassLevels — legacy single-class fallback', () => {
  it('derives a one-entry record from character_class + level', () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 5,
    });
    expect(getClassLevels(char)).toEqual({ fighter: 5 });
  });

  it('lower-cases the class name on the derived key', () => {
    const char = makeChar({ character_class: 'WIZARD', level: 3 });
    expect(getClassLevels(char)).toEqual({ wizard: 3 });
  });

  it('falls back to level 1 if level is missing', () => {
    const char = makeChar({ character_class: 'Rogue' });
    // makeChar defaults level to 1 already, so this exercises the
    // normal path rather than the literal undefined branch — but the
    // derived value should still be 1.
    expect(getClassLevels(char)).toEqual({ rogue: 1 });
  });
});

describe('getClassLevels — explicit multiclass breakdown', () => {
  it('returns the stored class_levels record as-is', () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 5,
      class_levels: { fighter: 3, wizard: 2 },
    });
    expect(getClassLevels(char)).toEqual({ fighter: 3, wizard: 2 });
  });

  it('prefers class_levels over the derived fallback', () => {
    // A divergent record (where char.level doesn't match the sum) is
    // still returned verbatim — the helper is a read-side accessor,
    // not a validator. Bookkeeping is the writer's responsibility.
    const char = makeChar({
      character_class: 'Fighter',
      level: 5, // claims total 5
      class_levels: { fighter: 3, wizard: 1 }, // sums to 4
    });
    expect(getClassLevels(char)).toEqual({ fighter: 3, wizard: 1 });
  });
});

describe('getClassLevel', () => {
  it('returns the level in a specific class (case-insensitive)', () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 6,
      class_levels: { fighter: 4, rogue: 2 },
    });
    expect(getClassLevel(char, 'fighter')).toBe(4);
    expect(getClassLevel(char, 'Fighter')).toBe(4);
    expect(getClassLevel(char, 'ROGUE')).toBe(2);
  });

  it('returns 0 for a class the PC has no levels in', () => {
    const char = makeChar({ character_class: 'Fighter', level: 5 });
    expect(getClassLevel(char, 'wizard')).toBe(0);
  });
});

describe('hasClass', () => {
  it('true when the PC has at least one level in the class', () => {
    const char = makeChar({
      class_levels: { fighter: 5, wizard: 1 },
    });
    expect(hasClass(char, 'fighter')).toBe(true);
    expect(hasClass(char, 'WIZARD')).toBe(true);
  });

  it('false when the PC has no levels in the class', () => {
    const char = makeChar({ character_class: 'Fighter', level: 5 });
    expect(hasClass(char, 'wizard')).toBe(false);
  });
});

describe('getTotalLevel', () => {
  it('sums all class_levels entries', () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 8,
      class_levels: { fighter: 5, wizard: 2, rogue: 1 },
    });
    expect(getTotalLevel(char)).toBe(8);
  });

  it('equals char.level for legacy single-class PCs', () => {
    const char = makeChar({ character_class: 'Cleric', level: 7 });
    expect(getTotalLevel(char)).toBe(7);
  });
});

describe('getAllClasses', () => {
  it('returns lowercased class names in insertion order', () => {
    const char = makeChar({
      character_class: 'Fighter',
      class_levels: { fighter: 3, wizard: 2 },
    });
    expect(getAllClasses(char)).toEqual(['fighter', 'wizard']);
  });

  it('returns a single-entry list for legacy single-class', () => {
    const char = makeChar({ character_class: 'Bard', level: 4 });
    expect(getAllClasses(char)).toEqual(['bard']);
  });
});

describe('getPrimaryClass', () => {
  it("returns char.character_class lowercased", () => {
    const char = makeChar({ character_class: 'Paladin', level: 6 });
    expect(getPrimaryClass(char)).toBe('paladin');
  });

  it("ignores class_levels — primary is always the first class taken", () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 5,
      class_levels: { wizard: 4, fighter: 1 }, // wizard added later
    });
    expect(getPrimaryClass(char)).toBe('fighter');
  });
});

describe('spellSlotsForChar — single-class parity', () => {
  it('returns the same slots as spellSlotsForClassLevel for a single-class Wizard 5', () => {
    const char = makeChar({ character_class: 'Wizard', level: 5 });
    expect(spellSlotsForChar(char)).toEqual(spellSlotsForClassLevel('wizard', 5));
  });

  it('half-caster Paladin 5 → caster level 2 slots (3 L1)', () => {
    const char = makeChar({ character_class: 'Paladin', level: 5 });
    // ⌊5/2⌋ = 2 → row { 1: 3 }
    expect(spellSlotsForChar(char)).toEqual({ 1: 3 });
  });

  it('third-caster Fighter 9 with Eldritch Knight subclass → caster level 3', () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 9,
      subclass: 'eldritch_knight',
    });
    // ⌊9/3⌋ = 3 → row { 1: 4, 2: 2 }
    expect(spellSlotsForChar(char)).toEqual({ 1: 4, 2: 2 });
  });

  it('non-caster Barbarian returns empty', () => {
    const char = makeChar({ character_class: 'Barbarian', level: 5 });
    expect(spellSlotsForChar(char)).toEqual({});
  });
});

describe('spellSlotsForChar — multiclass sums', () => {
  it('Wizard 3 / Cleric 2 → caster level 5 (full + full)', () => {
    const char = makeChar({
      character_class: 'Wizard',
      level: 5,
      class_levels: { wizard: 3, cleric: 2 },
    });
    // Caster level 5 row.
    expect(spellSlotsForChar(char)).toEqual(spellSlotsForClassLevel('wizard', 5));
  });

  it('Paladin 4 / Wizard 2 → caster level 4 (half ⌊4/2⌋=2 + full 2)', () => {
    const char = makeChar({
      character_class: 'Paladin',
      level: 6,
      class_levels: { paladin: 4, wizard: 2 },
    });
    expect(spellSlotsForChar(char)).toEqual(spellSlotsForClassLevel('wizard', 4));
  });

  it('Paladin 1 / Wizard 1 → caster level 1 (half ⌊1/2⌋=0 + full 1)', () => {
    const char = makeChar({
      character_class: 'Paladin',
      level: 2,
      class_levels: { paladin: 1, wizard: 1 },
    });
    expect(spellSlotsForChar(char)).toEqual({ 1: 2 });
  });

  it('non-primary subclass does NOT grant third-caster yet (known limit)', () => {
    // Wizard 5 / Fighter 6 — fighter has eldritch_knight subclass but
    // char.subclass applies only to the primary class today. So fighter
    // contributes 0 (non-caster from the helper's POV).
    const char = makeChar({
      character_class: 'Wizard',
      level: 11,
      class_levels: { wizard: 5, fighter: 6 },
      subclass: 'eldritch_knight', // applies to wizard (primary) only
    });
    // Wizard 5 alone → caster level 5.
    expect(spellSlotsForChar(char)).toEqual(spellSlotsForClassLevel('wizard', 5));
  });
});

describe('spellSlotsForChar — warlock', () => {
  it('pure Warlock 3 returns pact slots only', () => {
    const char = makeChar({ character_class: 'Warlock', level: 3 });
    expect(spellSlotsForChar(char)).toEqual(spellSlotsForClassLevel('warlock', 3));
  });

  it('Wizard 1 / Warlock 2 merges multiclass + pact slots (known approximation)', () => {
    const char = makeChar({
      character_class: 'Wizard',
      level: 3,
      class_levels: { wizard: 1, warlock: 2 },
    });
    // Wizard 1 → caster level 1 → { 1: 2 }
    // Warlock 2 → pact { 1: 2 }
    // Merged sum: { 1: 4 } (RAW would keep them as separate pools)
    expect(spellSlotsForChar(char)).toEqual({ 1: 4 });
  });
});
