// RE-2 — Disciplined Survivor (SRD 5.2.1, Monk L14): proficiency in all saving
// throws. Wired into `hasSaveProficiency`, so it flows through every save path.
// (The Focus-Point reroll-a-failed-save half is deferred.)

import { describe, expect, it } from 'vitest';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { hasDisciplinedSurvivor } from '../../src/services/multiclass.js';
import { hasSaveProficiency } from '../../src/services/gameEngine.js';
import { makeChar } from '../../src/test-fixtures.js';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

describe('hasDisciplinedSurvivor', () => {
  it('is granted at Monk L14, not L13', () => {
    expect(hasDisciplinedSurvivor(makeChar({ character_class: 'Monk', level: 14 }))).toBe(true);
    expect(hasDisciplinedSurvivor(makeChar({ character_class: 'Monk', level: 13 }))).toBe(false);
  });

  it('is false for non-Monks', () => {
    expect(hasDisciplinedSurvivor(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
  });
});

describe('hasSaveProficiency — Disciplined Survivor grant', () => {
  it('a Monk L14 is proficient in all six saving throws', () => {
    const m = makeChar({ character_class: 'Monk', level: 14 });
    for (const a of ABILITIES) expect(hasSaveProficiency(m, a, ctx)).toBe(true);
  });

  it('a Monk L13 is not yet proficient in the non-class saves (CON/INT/WIS/CHA)', () => {
    const m = makeChar({ character_class: 'Monk', level: 13 });
    // Monk class save proficiencies are STR + DEX.
    expect(hasSaveProficiency(m, 'str', ctx)).toBe(true);
    expect(hasSaveProficiency(m, 'dex', ctx)).toBe(true);
    expect(hasSaveProficiency(m, 'con', ctx)).toBe(false);
    expect(hasSaveProficiency(m, 'wis', ctx)).toBe(false);
  });
});
