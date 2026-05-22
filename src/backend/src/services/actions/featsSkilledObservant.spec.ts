// Skilled (origin) and Observant (general, L4 half-feat) — 2024
// PHB feats added 2026-05-22.
//
// Skilled: +3 skill proficiencies.
// Observant: +1 INT or WIS + 5 to passive Perception/Investigation.

import { applyFeatTake, getFeat } from '../feats.js';
import { describe, expect, it } from 'vitest';
import { context as ctx } from '../../contexts/sandbox.js';
import { makeChar } from '../../test-fixtures.js';
import { partyDetectsTrap } from '../gameEngine.js';

describe('Skilled feat', () => {
  it('grants 3 chosen skill proficiencies', () => {
    const char = makeChar({ id: 'pc-1', skill_proficiencies: [], feats: [] });
    const feat = getFeat('skilled', ctx);
    if (!feat) throw new Error('skilled missing');
    const { newChar } = applyFeatTake(char, feat, {
      skillChoices: ['Stealth', 'Perception', 'Athletics'],
    });
    expect(newChar.skill_proficiencies).toEqual(
      expect.arrayContaining(['Stealth', 'Perception', 'Athletics'])
    );
    expect(newChar.feats).toContain('skilled');
  });

  it('dedupes — already-proficient skills are not double-counted', () => {
    const char = makeChar({
      id: 'pc-1',
      skill_proficiencies: ['Stealth'],
      feats: [],
    });
    const feat = getFeat('skilled', ctx);
    if (!feat) throw new Error('skilled missing');
    const { newChar, narrative } = applyFeatTake(char, feat, {
      skillChoices: ['Stealth', 'Athletics', 'Perception'],
    });
    expect(newChar.skill_proficiencies?.filter((s) => s === 'Stealth')).toHaveLength(1);
    expect(newChar.skill_proficiencies).toEqual(
      expect.arrayContaining(['Stealth', 'Athletics', 'Perception'])
    );
    // Narrative only lists the newly-granted skills.
    expect(narrative).toMatch(/Athletics/);
    expect(narrative).toMatch(/Perception/);
    expect(narrative).not.toMatch(/Stealth/);
  });
});

describe('Observant feat — passive Perception bonus', () => {
  it('+5 to passive Perception makes a PC spot a high-DC trap they would otherwise miss', () => {
    // Trap DC 15. WIS 10 (mod 0), L1 (prof +2). Without Observant:
    // 10 + 0 + 2 (Perception prof) = 12 → misses DC 15. With
    // Observant: 12 + 5 = 17 → spots it.
    const trap = { dc: 15 } as { dc: number };
    const baseline = makeChar({
      id: 'pc-1',
      wis: 10,
      level: 1,
      skill_proficiencies: ['Perception'],
      feats: [],
    });
    const observant = makeChar({
      id: 'pc-2',
      wis: 10,
      level: 1,
      skill_proficiencies: ['Perception'],
      feats: ['observant'],
    });
    expect(partyDetectsTrap([baseline], trap as never)).toBe(false);
    expect(partyDetectsTrap([observant], trap as never)).toBe(true);
  });

  it('take-time: ability bonus + narrative', () => {
    const char = makeChar({ id: 'pc-1', wis: 13, feats: [] });
    const feat = getFeat('observant', ctx);
    if (!feat) throw new Error('observant missing');
    const { newChar, narrative } = applyFeatTake(char, feat, { abilityChoice: 'wis' });
    expect(newChar.wis).toBe(14);
    expect(narrative).toMatch(/Passive Perception/);
  });
});
