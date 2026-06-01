// starterQuestProgress — the opening-quest seed. Each story campaign marks
// exactly one quest `startActive`; that quest is seeded as `active` at session
// start (so the player begins with direction) while every other quest stays
// hidden from the log until discovered.

import { describe, expect, it } from 'vitest';
import type { Quest } from '../types.js';
import { context as grove } from '../contexts/grove_of_thorns.js';
import { starterQuestProgress } from './campaignEngine.js';
import { context as vale } from '../contexts/vale_of_shadows.js';

const quest = (id: string, startActive?: boolean): Quest => ({
  id,
  title: id,
  desc: '',
  steps: [],
  rewards: [],
  ...(startActive ? { startActive } : {}),
});

describe('starterQuestProgress', () => {
  it('seeds only the startActive quests, as active with no completed steps', () => {
    const seed = starterQuestProgress([quest('a'), quest('b', true), quest('c')]);
    expect(seed).toEqual([{ questId: 'b', status: 'active', completedSteps: [] }]);
  });

  it('returns [] when no quest is startActive (or the list is undefined)', () => {
    expect(starterQuestProgress([quest('a'), quest('b')])).toEqual([]);
    expect(starterQuestProgress(undefined)).toEqual([]);
  });
});

describe('story campaigns each open with exactly one starter quest', () => {
  const cases: { name: string; quests: Quest[]; opener: string }[] = [
    { name: 'Vale of Shadows', quests: vale.campaign?.quests ?? [], opener: 'quest_shipment' },
    { name: 'Grove of Thorns', quests: grove.campaign?.quests ?? [], opener: 'quest_silent_grove' },
  ];
  for (const c of cases) {
    it(`${c.name} → ${c.opener} is the sole startActive quest`, () => {
      const starters = c.quests.filter((q) => q.startActive);
      expect(starters.map((q) => q.id)).toEqual([c.opener]);
    });
  }
});
