// War Caster feat — advantage on CON saves to maintain concentration
// when damaged (2024 PHB general feat, L4 + Spellcasting feature
// prereq). The two other RAW benefits (somatic with hands full,
// opportunity-cast spell) aren't modeled yet.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFeatTake, getFeat } from '../feats.js';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { checkConcentration } from '../gameEngine.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

function withConcentration(overrides: Partial<ReturnType<typeof makeChar>> = {}) {
  return makeChar({
    id: 'pc-1',
    con: 10,
    concentrating_on: { spellId: 'bless', rounds_left: 10 },
    ...overrides,
  });
}

describe('War Caster — concentration save advantage', () => {
  it('rolls 2d20 keep-higher and notes War Caster in the narrative', () => {
    // d20 #1 → 1 (would fail), d20 #2 → 19 (passes). DC for 10 dmg = 10.
    mockRandom(0, 0.95);
    const char = withConcentration({ feats: ['war_caster'] });
    const state = makeState({ id: 'pc-1' });
    const result = checkConcentration(char, state, 10);
    expect(result.note).toMatch(/Concentration hold/);
    expect(result.note).toMatch(/War Caster advantage/);
    expect(result.char.concentrating_on).toBeDefined();
  });

  it('without War Caster, a low d20 fails the save and breaks concentration', () => {
    // Single d20 → 1. DC 10. Fails → concentration broken.
    mockRandom(0);
    const char = withConcentration({ feats: [] });
    const state = makeState({ id: 'pc-1' });
    const result = checkConcentration(char, state, 10);
    expect(result.note).toMatch(/Concentration broken/);
    expect(result.note).not.toMatch(/War Caster/);
    expect(result.char.concentrating_on).toBeFalsy();
  });

  it('with War Caster but both d20s low, save still fails', () => {
    // Both d20s → 1. DC 10. Even with advantage, both rolls fail.
    mockRandom(0, 0);
    const char = withConcentration({ feats: ['war_caster'] });
    const state = makeState({ id: 'pc-1' });
    const result = checkConcentration(char, state, 10);
    expect(result.note).toMatch(/Concentration broken/);
    expect(result.note).toMatch(/War Caster advantage/);
    expect(result.char.concentrating_on).toBeFalsy();
  });

  it('is a no-op when the PC is not concentrating', () => {
    const char = makeChar({ id: 'pc-1', feats: ['war_caster'] });
    const state = makeState({ id: 'pc-1' });
    const result = checkConcentration(char, state, 20);
    expect(result.note).toBe('');
  });
});

describe('War Caster — take-time', () => {
  it('records the feat and surfaces the take-time narrative', () => {
    const char = makeChar({ id: 'pc-1', feats: [] });
    const feat = getFeat('war_caster', ctx);
    if (!feat) throw new Error('war_caster missing from context');
    const { newChar, narrative } = applyFeatTake(char, feat);
    expect(newChar.feats).toContain('war_caster');
    expect(narrative).toMatch(/Advantage on CON saves to maintain concentration/);
  });
});
