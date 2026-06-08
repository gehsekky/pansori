// Regression specs for the cast-menu label formatters surfaced in the
// Vale of Shadows log:
//   "Cast Cure Wounds (2th slot — upcast +12d8 — 3 slots left)"
// Two bugs in one label: "2th" (hardcoded "th" suffix) and "+12d8" (the
// level delta pasted in front of the unscaled die string).

import { describe, expect, it } from 'vitest';
import { ordinal, scaleUpcastDice } from '../../src/services/gameEngine.js';

describe('ordinal — spell-slot suffixes', () => {
  it('uses the correct suffix for 1–9', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(9)).toBe('9th');
  });

  it('handles the teens exception', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
  });
});

describe('scaleUpcastDice — per-level bonus scaling', () => {
  it('one level above base returns the per-level bonus unchanged', () => {
    // Cure Wounds in a L2 slot: +2d8, NOT +12d8.
    expect(scaleUpcastDice('2d8', 1)).toBe('2d8');
    expect(scaleUpcastDice('1d8', 1)).toBe('1d8');
  });

  it('multiplies the dice count by the number of levels above base', () => {
    expect(scaleUpcastDice('2d8', 2)).toBe('4d8');
    expect(scaleUpcastDice('1d10', 3)).toBe('3d10');
  });

  it('scales flat numeric bonuses', () => {
    expect(scaleUpcastDice('5', 2)).toBe('10');
  });

  it('leaves unrecognized shapes as the per-level bonus', () => {
    // "1d4+1" (Magic Missile-style) — darts are handled specially elsewhere;
    // the label should not corrupt the string.
    expect(scaleUpcastDice('1d4+1', 1)).toBe('1d4+1');
  });
});
