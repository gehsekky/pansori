// RE-2 — Expertise (SRD 5.2.1, Rogue L1/L6, Bard L2/L9): double the proficiency
// bonus on two (then two more) chosen skill proficiencies. `choose_expertise`
// (meta.ts) is the selection surface; `skillCheck` doubles prof when the
// `expertise` flag is set and the check is proficient. Wired through the three
// skillCheck callers (search → Investigation, sneak/hide → Stealth).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { enemyActor, pcActor } from '../../src/services/actions/actor.js';
import {
  expertiseSlots,
  expertiseSlotsForClassLevel,
  hasExpertise,
  resolveCreationExpertise,
} from '../../src/services/multiclass.js';
import { makeChar, mockRandom } from '../../src/test-fixtures.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import type { Enemy } from '../../src/types.js';
import { handleChooseExpertise } from '../../src/services/actions/meta.js';
import { skillCheck } from '../../src/services/rulesEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('expertiseSlots', () => {
  it('Rogue gets 2 at L1 and 4 at L6', () => {
    expect(expertiseSlots(makeChar({ character_class: 'Rogue', level: 1 }))).toBe(2);
    expect(expertiseSlots(makeChar({ character_class: 'Rogue', level: 5 }))).toBe(2);
    expect(expertiseSlots(makeChar({ character_class: 'Rogue', level: 6 }))).toBe(4);
  });

  it('Bard gets 2 at L2 and 4 at L9', () => {
    expect(expertiseSlots(makeChar({ character_class: 'Bard', level: 1 }))).toBe(0);
    expect(expertiseSlots(makeChar({ character_class: 'Bard', level: 2 }))).toBe(2);
    expect(expertiseSlots(makeChar({ character_class: 'Bard', level: 9 }))).toBe(4);
  });

  it('is 0 for other classes and sums independent multiclass grants', () => {
    expect(expertiseSlots(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(0);
    expect(
      expertiseSlots(
        makeChar({ character_class: 'Rogue', level: 3, class_levels: { rogue: 1, bard: 2 } })
      )
    ).toBe(4); // 2 (Rogue L1) + 2 (Bard L2)
  });
});

describe('expertiseSlotsForClassLevel — single-class creation view', () => {
  it('Rogue grants 2 at level 1 (4 at 6); only Rogue grants any at level 1', () => {
    expect(expertiseSlotsForClassLevel('Rogue', 1)).toBe(2);
    expect(expertiseSlotsForClassLevel('rogue', 6)).toBe(4);
    expect(expertiseSlotsForClassLevel('Bard', 1)).toBe(0); // Bard waits for L2
    expect(expertiseSlotsForClassLevel('Wizard', 1)).toBe(0); // Scholar at L2
    expect(expertiseSlotsForClassLevel('Fighter', 1)).toBe(0);
  });
});

describe('resolveCreationExpertise — Rogue level-1 picks', () => {
  const profs = ['stealth', 'perception', 'sleight_of_hand', 'athletics'];

  it('keeps a valid 2-skill pick drawn from the proficiencies', () => {
    expect(resolveCreationExpertise('Rogue', ['stealth', 'perception'], profs)).toEqual([
      'stealth',
      'perception',
    ]);
  });

  it('normalizes picks to the canonical proficiency casing', () => {
    expect(resolveCreationExpertise('Rogue', ['STEALTH', 'Perception'], profs)).toEqual([
      'stealth',
      'perception',
    ]);
  });

  it('falls back to the first proficiencies on an invalid / wrong-count / off-list pick', () => {
    expect(resolveCreationExpertise('Rogue', undefined, profs)).toEqual(['stealth', 'perception']);
    expect(resolveCreationExpertise('Rogue', ['stealth'], profs)).toEqual([
      'stealth',
      'perception',
    ]); // too few
    expect(resolveCreationExpertise('Rogue', ['stealth', 'arcana'], profs)).toEqual([
      'stealth',
      'perception',
    ]); // arcana not proficient
    expect(resolveCreationExpertise('Rogue', ['stealth', 'stealth'], profs)).toEqual([
      'stealth',
      'perception',
    ]); // not distinct
  });

  it('returns [] for a class without level-1 Expertise', () => {
    expect(resolveCreationExpertise('Fighter', ['stealth', 'perception'], profs)).toEqual([]);
    expect(resolveCreationExpertise('Bard', ['stealth', 'perception'], profs)).toEqual([]);
  });
});

describe('hasExpertise', () => {
  it('matches case-insensitively', () => {
    const c = makeChar({ expertise_skills: ['Stealth'] });
    expect(hasExpertise(c, 'stealth')).toBe(true);
    expect(hasExpertise(c, 'Perception')).toBe(false);
  });
});

function ctxFor(char: ReturnType<typeof makeChar>): ActionContext {
  return {
    actor: pcActor(char, 0),
    st: { characters: [char] },
    narrative: '',
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('handleChooseExpertise', () => {
  const rogue = (over = {}) =>
    makeChar({
      id: 'r',
      character_class: 'Rogue',
      level: 1,
      skill_proficiencies: ['Stealth', 'Perception', 'Investigation'],
      ...over,
    });

  it('grants Expertise in a proficient skill', () => {
    const c = ctxFor(rogue());
    handleChooseExpertise(c, { type: 'choose_expertise', skill: 'Stealth' });
    expect(pcChar(c).expertise_skills).toEqual(['Stealth']);
    expect(c.narrative).toContain('Expertise in Stealth');
  });

  it('rejects a non-PC actor', () => {
    const enemy = { id: 'orc', name: 'Orc' } as unknown as Enemy;
    const c = {
      actor: enemyActor(enemy),
      st: { characters: [] },
      narrative: '',
    } as unknown as ActionContext;
    expect(handleChooseExpertise(c, { type: 'choose_expertise', skill: 'Stealth' })).toMatchObject({
      rejected: expect.stringContaining('PC'),
    });
  });

  it('rejects a skill the character is not proficient in', () => {
    const c = ctxFor(rogue());
    expect(
      handleChooseExpertise(c, { type: 'choose_expertise', skill: 'Acrobatics' })
    ).toMatchObject({ rejected: expect.stringContaining('proficient') });
  });

  it('no-ops a duplicate pick (case-insensitive)', () => {
    const c = ctxFor(rogue({ expertise_skills: ['Stealth'] }));
    handleChooseExpertise(c, { type: 'choose_expertise', skill: 'stealth' });
    expect(pcChar(c).expertise_skills).toEqual(['Stealth']); // unchanged
    expect(c.narrative).toContain('already');
  });

  it('refuses once both L1 slots are spent', () => {
    const c = ctxFor(rogue({ expertise_skills: ['Stealth', 'Perception'] })); // 2/2 at L1
    handleChooseExpertise(c, { type: 'choose_expertise', skill: 'Investigation' });
    expect(pcChar(c).expertise_skills).toEqual(['Stealth', 'Perception']); // unchanged
    expect(c.narrative).toContain('no Expertise choice');
  });
});

// skillCheck(score, dc, prof, level, disadv, expertise, ...). L5 → prof +3.
describe('skillCheck — Expertise doubles proficiency', () => {
  it('doubles the proficiency bonus on a proficient check', () => {
    mockRandom(0.45); // d20 → 10
    const r = skillCheck(10, 99, true, 5, false, true);
    expect(r.total).toBe(16); // 10 + 0 mod + (3 prof × 2)
  });

  it('is a plain proficient check without Expertise', () => {
    mockRandom(0.45);
    const r = skillCheck(10, 99, true, 5, false, false);
    expect(r.total).toBe(13); // 10 + 0 + 3
  });
});
