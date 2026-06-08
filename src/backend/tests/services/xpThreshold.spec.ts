// Locks the SRD 5.2.1 Character Advancement XP table and the leveling gate it
// drives. Replaces the former compressed `level × 100` curve, which let a single
// quest reward vault a character several levels at once.

import { describe, expect, it } from 'vitest';
import { levelUpWorkFor, xpForLevel } from '../../src/services/gameEngine.js';
import { makeChar } from '../../src/test-fixtures.js';

describe('xpForLevel — SRD 5.2.1 Character Advancement table', () => {
  it('returns the canonical total-XP thresholds', () => {
    // SRD 5.2.1 totals to BE at each level.
    const expected: Record<number, number> = {
      1: 0,
      2: 300,
      3: 900,
      4: 2_700,
      5: 6_500,
      6: 14_000,
      7: 23_000,
      8: 34_000,
      9: 48_000,
      10: 64_000,
      11: 85_000,
      12: 100_000,
      13: 120_000,
      14: 140_000,
      15: 165_000,
      16: 195_000,
      17: 225_000,
      18: 265_000,
      19: 305_000,
      20: 355_000,
    };
    for (const [lvl, xp] of Object.entries(expected)) {
      expect(xpForLevel(Number(lvl))).toBe(xp);
    }
  });

  it('clamps below 1 to 0 and past 20 to the L20 entry', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-5)).toBe(0);
    expect(xpForLevel(25)).toBe(355_000);
  });
});

describe('levelUpWorkFor — XP-gated advancement', () => {
  it('does not advance until total XP reaches the next-level threshold', () => {
    expect(levelUpWorkFor(makeChar({ level: 3, xp: 2_699 }))).toBeNull();
    expect(levelUpWorkFor(makeChar({ level: 3, xp: 2_700 }))).toBe('advance');
  });

  it('never advances past the level cap (20)', () => {
    expect(levelUpWorkFor(makeChar({ level: 20, xp: 999_999 }))).toBeNull();
  });

  it('resolves pending ASI / mastery picks before advancing again', () => {
    expect(levelUpWorkFor(makeChar({ level: 4, xp: 999_999, asi_pending: true }))).toBe('asi');
    expect(levelUpWorkFor(makeChar({ level: 4, xp: 999_999, weapon_mastery_pending: 1 }))).toBe(
      'mastery'
    );
  });
});
