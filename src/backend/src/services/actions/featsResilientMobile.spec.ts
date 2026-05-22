// Tests for Resilient (half-feat: +1 ability + save proficiency)
// and Mobile (+10 ft speed) — 2024 PHB general feats added 2026-05-22.

import { applyFeatTake, getFeat } from '../feats.js';
import { describe, expect, it } from 'vitest';
import { context as ctx } from '../../contexts/sandbox.js';
import { effectiveSpeed } from '../gameEngine.js';
import { makeChar } from '../../test-fixtures.js';

describe('Resilient feat', () => {
  it('+1 to the chosen ability and records save proficiency in feat_choices', () => {
    const char = makeChar({ id: 'pc-1', con: 14, feats: [] });
    const feat = getFeat('resilient', ctx);
    if (!feat) throw new Error('resilient feat missing from context');
    const { newChar } = applyFeatTake(char, feat, {
      abilityChoice: 'con',
      saveProficiencyChoices: ['con'],
    });
    expect(newChar.con).toBe(15);
    expect(newChar.feat_choices?.resilient?.saveProficiencies).toEqual(['con']);
  });

  it('records both the ability bonus and save proficiency under the same feat id', () => {
    const char = makeChar({ id: 'pc-1', wis: 12, feats: [] });
    const feat = getFeat('resilient', ctx);
    if (!feat) throw new Error('resilient feat missing from context');
    const { newChar } = applyFeatTake(char, feat, {
      abilityChoice: 'wis',
      saveProficiencyChoices: ['wis'],
    });
    expect(newChar.wis).toBe(13);
    expect(newChar.feat_choices?.resilient?.abilityBonus).toBe('wis');
    expect(newChar.feat_choices?.resilient?.saveProficiencies).toEqual(['wis']);
  });
});

describe('Mobile feat', () => {
  it('adds +10 ft to effective speed', () => {
    const plain = makeChar({ id: 'pc-1', feats: [] });
    const mobile = makeChar({ id: 'pc-2', feats: ['mobile'] });
    expect(effectiveSpeed(plain)).toBe(30);
    expect(effectiveSpeed(mobile)).toBe(40);
  });

  it('stacks with Goliath Large Form (+10 from form, +10 from feat)', () => {
    const big = makeChar({
      id: 'pc-1',
      feats: ['mobile'],
      conditions: ['large_form'],
    });
    expect(effectiveSpeed(big)).toBe(50); // 30 base + 10 large_form + 10 mobile
  });

  it('encumbrance still reduces the bonused speed (mobile + heavy encumbrance)', () => {
    // STR 10 → 5×STR = 50 lbs threshold. Item weight 60 → encumbered (>5×STR).
    const burdened = makeChar({
      id: 'pc-1',
      str: 10,
      feats: ['mobile'],
      inventory: [{ instance_id: 'rock-1', id: 'rock', name: 'Heavy Rock', weight: 60 }],
    });
    // Base 30 + 10 Mobile = 40; encumbered -10 = 30.
    expect(effectiveSpeed(burdened)).toBe(30);
  });

  it('take-time narrative reports the +10 ft', () => {
    const char = makeChar({ id: 'pc-1', feats: [] });
    const feat = getFeat('mobile', ctx);
    if (!feat) throw new Error('mobile feat missing from context');
    const { newChar, narrative } = applyFeatTake(char, feat);
    expect(newChar.feats).toContain('mobile');
    expect(narrative).toMatch(/\+10 ft speed/);
  });
});
