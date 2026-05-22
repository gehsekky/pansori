// Tavern Brawler feat — half-feat (+1 STR or CON) + unarmed
// strikes deal 1d4 + STR mod instead of 1 + STR mod (2024 PHB
// origin feat). Two RAW benefits skipped: improvised-weapon prof
// and free Shove on unarmed hit.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFeatTake, getFeat } from '../feats.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { makeChar } from '../../test-fixtures.js';
import { unarmedDamage } from '../rulesEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('unarmedDamage helper — Tavern Brawler flag', () => {
  it('without flag: 1 + STR mod (the standard PHB unarmed)', () => {
    expect(unarmedDamage(10)).toBe(1);
    expect(unarmedDamage(14)).toBe(3); // 1 + 2
    expect(unarmedDamage(16)).toBe(4); // 1 + 3
  });

  it('with Tavern Brawler flag: 1d4 + STR mod (min 1)', () => {
    // d4 random = 0.0 → 1, so 1d4 → 1; result = 1 + STR mod.
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    expect(unarmedDamage(14, true)).toBe(3); // 1 + 2
    // Reset + try higher d4 roll.
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(unarmedDamage(14, true)).toBe(6); // 4 + 2
  });

  it('respects the 1-floor even with negative STR mod', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    // STR 4 → mod -3. 1 + (-3) = -2 → floors to 1.
    expect(unarmedDamage(4)).toBe(1);
    // Tavern Brawler: 1d4 (random=0) = 1, + (-3) = -2 → floors to 1.
    expect(unarmedDamage(4, true)).toBe(1);
  });
});

describe('Tavern Brawler feat — take-time', () => {
  it('half-feat: applies +1 to the chosen ability + records the feat', () => {
    const char = makeChar({ id: 'pc-1', str: 14, feats: [] });
    const feat = getFeat('tavern_brawler', ctx);
    if (!feat) throw new Error('tavern_brawler missing from context');
    const { newChar, narrative } = applyFeatTake(char, feat, { abilityChoice: 'str' });
    expect(newChar.feats).toContain('tavern_brawler');
    expect(newChar.str).toBe(15);
    expect(newChar.feat_choices?.tavern_brawler?.abilityBonus).toBe('str');
    expect(narrative).toMatch(/Unarmed strikes now roll 1d4/);
  });

  it('also accepts CON as the half-feat ability', () => {
    const char = makeChar({ id: 'pc-1', con: 12, feats: [] });
    const feat = getFeat('tavern_brawler', ctx);
    if (!feat) throw new Error('tavern_brawler missing from context');
    const { newChar } = applyFeatTake(char, feat, { abilityChoice: 'con' });
    expect(newChar.con).toBe(13);
    expect(newChar.feat_choices?.tavern_brawler?.abilityBonus).toBe('con');
  });
});
