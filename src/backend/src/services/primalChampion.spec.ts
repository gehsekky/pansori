// RE-2 — Primal Champion (SRD 5.2.1, Barbarian L20 capstone): your Strength and
// Constitution scores each increase by 4, to a maximum of 30. The CON increase
// raises max HP retroactively. Applied at the L20 milestone in
// applyLevelUpForClass.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass } from './gameEngine.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { makeChar } from '../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

const barb = (over = {}) =>
  makeChar({
    character_class: 'Barbarian',
    str: 20,
    con: 18,
    hit_die: 12,
    hp: 100,
    max_hp: 100,
    ...over,
  });

describe('Primal Champion (Barbarian L20)', () => {
  it('boosts STR and CON by 4 and raises max HP when reaching L20', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = barb({ level: 19 });
    applyLevelUpForClass(c, 'Barbarian', ctx);
    expect(c.level).toBe(20);
    expect(c.str).toBe(24);
    expect(c.con).toBe(22);
    expect(c.max_hp).toBeGreaterThan(100); // level-up HP + the CON-boost retroactive HP
  });

  it('caps STR and CON at 30', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = barb({ level: 19, str: 28, con: 28 });
    applyLevelUpForClass(c, 'Barbarian', ctx);
    expect(c.str).toBe(30);
    expect(c.con).toBe(30);
  });

  it('does not fire before L20', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = barb({ level: 18 });
    applyLevelUpForClass(c, 'Barbarian', ctx);
    expect(c.level).toBe(19);
    expect(c.str).toBe(20); // unchanged
    expect(c.con).toBe(18);
  });

  it('does not fire for a non-Barbarian reaching L20', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = makeChar({ character_class: 'Fighter', level: 19, str: 20, con: 18 });
    applyLevelUpForClass(c, 'Fighter', ctx);
    expect(c.level).toBe(20);
    expect(c.str).toBe(20); // unchanged
    expect(c.con).toBe(18);
  });
});
