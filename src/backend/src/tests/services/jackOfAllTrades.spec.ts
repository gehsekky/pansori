// RE-2 — Jack of All Trades (SRD 5.2.1, Bard L2): add half the proficiency
// bonus (round down) to any ability check using a skill the bard is NOT
// proficient in. `skillCheck` already applies the half-prof when its
// `jackOfAllTrades` flag is set and the check is non-proficient; this wires the
// flag (Bard L2+) through the three skillCheck callers (search / sneak / hide).
// Note: the inline contested checks (grapple/shove, social) don't route through
// skillCheck, so JoAT doesn't reach them yet — same boundary as Reliable Talent.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import { hasJackOfAllTrades } from '../../services/multiclass.js';
import { skillCheck } from '../../services/rulesEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('hasJackOfAllTrades', () => {
  it('is granted at Bard L2, not L1', () => {
    expect(hasJackOfAllTrades(makeChar({ character_class: 'Bard', level: 2 }))).toBe(true);
    expect(hasJackOfAllTrades(makeChar({ character_class: 'Bard', level: 1 }))).toBe(false);
  });

  it('is false for non-Bards', () => {
    expect(hasJackOfAllTrades(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
  });

  it('counts Bard levels in a multiclass', () => {
    expect(
      hasJackOfAllTrades(
        makeChar({ character_class: 'Fighter', level: 7, class_levels: { fighter: 5, bard: 2 } })
      )
    ).toBe(true);
  });
});

// skillCheck(score, dc, prof, level, disadv, expertise, joat, adv, ...).
// Level 5 → proficiency bonus +3; ability score 10 → +0 modifier; d20 → 10.
describe('skillCheck — Jack of All Trades', () => {
  it('adds half proficiency (round down) to a non-proficient check', () => {
    mockRandom(0.45); // d20 → 10
    const r = skillCheck(10, 99, false, 5, false, false, true);
    expect(r.total).toBe(11); // 10 + 0 + floor(3/2)=1
  });

  it('uses full proficiency on a proficient check (no half-prof stacking)', () => {
    mockRandom(0.45);
    const r = skillCheck(10, 99, true, 5, false, false, true);
    expect(r.total).toBe(13); // 10 + 0 + 3 prof; JoAT ignored when proficient
  });

  it('adds nothing when the flag is off', () => {
    mockRandom(0.45);
    const r = skillCheck(10, 99, false, 5, false, false, false);
    expect(r.total).toBe(10); // 10 + 0 + 0
  });
});
