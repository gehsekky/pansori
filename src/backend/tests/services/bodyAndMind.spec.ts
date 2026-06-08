// RE-2 — Body and Mind (SRD 5.2.1, Monk L20 capstone): your Dexterity and
// Wisdom scores each increase by 4, to a maximum of 25. Applied at the L20
// milestone in applyLevelUpForClass (neither affects max HP).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass } from '../../src/services/gameEngine.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { makeChar } from '../../src/test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

const monk = (over = {}) =>
  makeChar({ character_class: 'Monk', dex: 18, wis: 16, hp: 80, max_hp: 80, ...over });

describe('Body and Mind (Monk L20)', () => {
  it('boosts DEX and WIS by 4 when reaching L20', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = monk({ level: 19 });
    applyLevelUpForClass(c, 'Monk', ctx);
    expect(c.level).toBe(20);
    expect(c.dex).toBe(22);
    expect(c.wis).toBe(20);
  });

  it('caps DEX and WIS at 25', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = monk({ level: 19, dex: 22, wis: 23 });
    applyLevelUpForClass(c, 'Monk', ctx);
    expect(c.dex).toBe(25); // 22 + 4 = 26 → 25
    expect(c.wis).toBe(25); // 23 + 4 = 27 → 25
  });

  it('does not fire before L20', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = monk({ level: 18 });
    applyLevelUpForClass(c, 'Monk', ctx);
    expect(c.dex).toBe(18); // unchanged
    expect(c.wis).toBe(16);
  });

  it('does not fire for a non-Monk reaching L20', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = makeChar({ character_class: 'Fighter', level: 19, dex: 18, wis: 16 });
    applyLevelUpForClass(c, 'Fighter', ctx);
    expect(c.dex).toBe(18);
    expect(c.wis).toBe(16);
  });
});
