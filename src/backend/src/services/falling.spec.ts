// Falling damage tests — covers the 1d6/10ft formula, 20d6 cap,
// prone-on-survive rule, the sub-10ft no-op, and the kill/knockout
// path that skips the prone application.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import { applyFallingDamage } from './damage.js';

afterEach(() => vi.restoreAllMocks());

describe('applyFallingDamage', () => {
  it('returns a no-op for falls under 10 ft', () => {
    const char = makeChar({ hp: 20, max_hp: 20 });
    const st = makeState({ hp: 20, max_hp: 20 });
    const result = applyFallingDamage(char, 5, st);
    expect(result.amountDealt).toBe(0);
    expect(result.diceRolled).toBe(0);
    expect(result.landedProne).toBe(false);
    expect(result.char.hp).toBe(20);
  });

  it('rolls 3d6 for a 30-ft fall and lands prone on survive', () => {
    // Max damage: 3d6 → 18. mockRandom(0.99) forces max dice.
    mockRandom(0.99, 0.99, 0.99);
    const char = makeChar({ hp: 30, max_hp: 30 });
    const st = makeState({ hp: 30, max_hp: 30 });
    const result = applyFallingDamage(char, 30, st);
    expect(result.diceRolled).toBe(3);
    expect(result.rolledDamage).toBe(18);
    expect(result.amountDealt).toBe(18);
    expect(result.char.hp).toBe(12);
    expect(result.landedProne).toBe(true);
    expect(result.char.conditions).toContain('prone');
    expect(result.narrative).toMatch(/falls 30 ft/);
    expect(result.narrative).toMatch(/lands prone/);
  });

  it('caps at 20d6 for falls over 200 ft', () => {
    mockRandom(0.99); // d6 → 6 each
    const char = makeChar({ hp: 200, max_hp: 200 });
    const st = makeState({ hp: 200, max_hp: 200 });
    const result = applyFallingDamage(char, 500, st);
    // 500 / 10 = 50 dice, capped at 20. Max damage = 20*6 = 120.
    expect(result.diceRolled).toBe(20);
    expect(result.rolledDamage).toBeLessThanOrEqual(120);
    expect(result.rolledDamage).toBeGreaterThan(0);
  });

  it('skips prone when the fall knocks the character to 0 HP', () => {
    mockRandom(0.99); // max dice → 24 from 4d6
    const char = makeChar({ hp: 5, max_hp: 20 });
    const st = makeState({ hp: 5, max_hp: 20 });
    const result = applyFallingDamage(char, 40, st);
    expect(result.char.hp).toBe(0);
    expect(result.landedProne).toBe(false);
    expect(result.char.conditions ?? []).not.toContain('prone');
  });
});
