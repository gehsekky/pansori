// RE-2 — Reliable Talent (SRD 5.2.1, Rogue L7). On an ability check that uses
// a skill/tool proficiency, treat a d20 of 9 or lower as a 10. Implemented as a
// `reliableTalent` flag on the shared `skillCheck` resolver, gated on
// `proficient` so it only fires on a proficient check (RAW). Threaded from the
// three skillCheck callers (search/Investigation, sneak Stealth, hide Stealth).
// Note: grapple/shove (Athletics/Acrobatics) and social Persuasion roll inline
// without skillCheck (and without a proficiency bonus today), so they don't yet
// benefit — deferred follow-up tracked in docs/TODO.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../../src/test-fixtures.js';
import { hasReliableTalent } from '../../src/services/multiclass.js';
import { skillCheck } from '../../src/services/rulesEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('hasReliableTalent', () => {
  it('is granted at Rogue L7, not L6', () => {
    expect(hasReliableTalent(makeChar({ character_class: 'Rogue', level: 7 }))).toBe(true);
    expect(hasReliableTalent(makeChar({ character_class: 'Rogue', level: 6 }))).toBe(false);
  });

  it('is false for non-Rogues', () => {
    expect(hasReliableTalent(makeChar({ character_class: 'Wizard', level: 20 }))).toBe(false);
  });

  it('counts Rogue levels in a multiclass', () => {
    expect(
      hasReliableTalent(
        makeChar({ character_class: 'Fighter', level: 12, class_levels: { fighter: 5, rogue: 7 } })
      )
    ).toBe(true);
  });
});

// skillCheck(score, dc, proficient, level, disadv, expertise, joat, adv,
//            halflingLucky, reliableTalent, reviveD20Pen)
// Level 7 → proficiency bonus +3; ability score 10 → +0 modifier.
describe('skillCheck — Reliable Talent floor', () => {
  it('floors a proficient sub-10 roll to 10', () => {
    mockRandom(0.2); // d20 → 5
    const r = skillCheck(10, 1, true, 7, false, false, false, false, false, true);
    expect(r.roll).toBe(10); // 5 floored to 10
    expect(r.total).toBe(13); // 10 + 0 + 3 prof
  });

  it('leaves a roll of 10+ untouched', () => {
    mockRandom(0.7); // d20 → 15
    const r = skillCheck(10, 1, true, 7, false, false, false, false, false, true);
    expect(r.roll).toBe(15);
    expect(r.total).toBe(18); // 15 + 0 + 3
  });

  it('does not floor a check the rogue is not proficient in (RAW)', () => {
    mockRandom(0.2); // d20 → 5
    const r = skillCheck(10, 1, false, 7, false, false, false, false, false, true);
    expect(r.roll).toBe(5); // not proficient → no floor
    expect(r.total).toBe(5); // 5 + 0 + 0
  });

  it('does nothing without the feature', () => {
    mockRandom(0.2); // d20 → 5
    const r = skillCheck(10, 1, true, 7, false, false, false, false, false, false);
    expect(r.roll).toBe(5);
    expect(r.total).toBe(8); // 5 + 0 + 3
  });

  it('floors after a Halfling Lucky nat-1 reroll', () => {
    mockRandom(0, 0.2); // d20 → 1, then Lucky reroll → 5
    const r = skillCheck(10, 1, true, 7, false, false, false, false, true, true);
    expect(r.roll).toBe(10); // reroll 5 then floored to 10
  });
});
