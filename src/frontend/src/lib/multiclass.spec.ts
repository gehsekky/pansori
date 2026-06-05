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
});
