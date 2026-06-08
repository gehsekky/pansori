// Skilled (Origin feat, SRD 5.2.1).

import { applyFeatTake, getFeat } from '../../../src/services/feats.js';
import { describe, expect, it } from 'vitest';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { makeChar } from '../../../src/test-fixtures.js';

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
