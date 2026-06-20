import { canMulticlassInto, formatPrereq, levelUpAvailable } from './multiclass';
import { describe, expect, it } from 'vitest';
import { MULTICLASS_PREREQS } from './multiclass';
import { makeChar } from '../components/test-fixtures';

describe('canMulticlassInto (FE)', () => {
  it('returns empty for the primary class regardless of stats', () => {
    const char = makeChar({ character_class: 'Fighter', str: 8, dex: 8 });
    expect(canMulticlassInto(char, 'Fighter')).toBe('');
  });

  it('returns empty when AND prereq is met', () => {
    const char = makeChar({ character_class: 'Fighter', str: 14, cha: 14 });
    expect(canMulticlassInto(char, 'Paladin')).toBe('');
  });

  it('returns reason when an AND prereq fails', () => {
    const char = makeChar({ character_class: 'Fighter', str: 14, cha: 10 });
    expect(canMulticlassInto(char, 'Paladin')).toMatch(/CHA 13/);
  });

  it('returns empty when OR prereq satisfied by either branch', () => {
    const lowStrChar = makeChar({ character_class: 'Wizard', str: 8, dex: 16 });
    expect(canMulticlassInto(lowStrChar, 'Fighter')).toBe('');
    const lowDexChar = makeChar({ character_class: 'Wizard', str: 16, dex: 8 });
    expect(canMulticlassInto(lowDexChar, 'Fighter')).toBe('');
  });

  it('returns reason when OR prereq fails on both branches', () => {
    const char = makeChar({ character_class: 'Wizard', str: 8, dex: 8 });
    const reason = canMulticlassInto(char, 'Fighter');
    expect(reason).toMatch(/STR 13/);
    expect(reason).toMatch(/DEX 13/);
  });

  it('returns unknown-class message for non-PHB classes', () => {
    const char = makeChar();
    expect(canMulticlassInto(char, 'Necromancer')).toMatch(/not a known class/);
  });

  it('covers all 12 SRD classes', () => {
    expect(Object.keys(MULTICLASS_PREREQS).sort()).toEqual(
      [
        'barbarian',
        'bard',
        'cleric',
        'druid',
        'fighter',
        'monk',
        'paladin',
        'ranger',
        'rogue',
        'sorcerer',
        'warlock',
        'wizard',
      ].sort()
    );
  });
});

describe('formatPrereq', () => {
  it('joins AND requirements with " + "', () => {
    expect(formatPrereq(MULTICLASS_PREREQS['paladin'])).toBe('STR 13 + CHA 13');
  });

  it('joins OR requirements with " or "', () => {
    expect(formatPrereq(MULTICLASS_PREREQS['fighter'])).toBe('STR 13 or DEX 13');
  });
});

describe('levelUpAvailable', () => {
  it('returns true when xp ≥ the SRD next-level threshold and out of combat', () => {
    // L1 → L2 needs 300 XP (SRD 5.2.1 Character Advancement table).
    const char = makeChar({ level: 1, xp: 300 });
    expect(levelUpAvailable(char, false)).toBe(true);
  });

  it('returns false when the xp threshold is not met', () => {
    // L2 → L3 needs 900 XP; 899 is just short.
    const char = makeChar({ level: 2, xp: 899 });
    expect(levelUpAvailable(char, false)).toBe(false);
  });

  it('returns false in combat even with sufficient xp', () => {
    const char = makeChar({ level: 1, xp: 500 });
    expect(levelUpAvailable(char, true)).toBe(false);
  });

  it('returns false at level cap (20)', () => {
    const char = makeChar({ level: 20, xp: 99999 });
    expect(levelUpAvailable(char, false)).toBe(false);
  });

  it('returns false when dead', () => {
    const char = makeChar({ level: 1, xp: 500, dead: true });
    expect(levelUpAvailable(char, false)).toBe(false);
  });

  // D-05: the +LVL badge also fires for "finish leveling" — a pending pick from
  // a prior advance — mirroring the backend `levelUpWorkFor` non-null states.
  it('returns true for a pending ASI even below the XP threshold (out of combat)', () => {
    const char = makeChar({ level: 4, xp: 0, asi_pending: true });
    expect(levelUpAvailable(char, false)).toBe(true);
  });

  it('returns true for a pending weapon-mastery pick (out of combat)', () => {
    const char = makeChar({ level: 5, xp: 0, weapon_mastery_pending: 1 });
    expect(levelUpAvailable(char, false)).toBe(true);
  });

  it('returns true for a pending spell pick (out of combat)', () => {
    const char = makeChar({ level: 5, xp: 0, spells_to_learn: 1 });
    expect(levelUpAvailable(char, false)).toBe(true);
  });

  it('returns false for any pending pick while IN combat (badge never in combat)', () => {
    const asi = makeChar({ level: 4, xp: 0, asi_pending: true });
    const mastery = makeChar({ level: 5, xp: 0, weapon_mastery_pending: 1 });
    const spell = makeChar({ level: 5, xp: 0, spells_to_learn: 1 });
    expect(levelUpAvailable(asi, true)).toBe(false);
    expect(levelUpAvailable(mastery, true)).toBe(false);
    expect(levelUpAvailable(spell, true)).toBe(false);
  });

  it('returns false for a pending pick when dead or at level cap', () => {
    expect(levelUpAvailable(makeChar({ level: 5, spells_to_learn: 1, dead: true }), false)).toBe(
      false
    );
    expect(levelUpAvailable(makeChar({ level: 20, xp: 999999, asi_pending: true }), false)).toBe(
      false
    );
  });
});
