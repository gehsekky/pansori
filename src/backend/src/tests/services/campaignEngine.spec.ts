// starterQuestProgress — the opening-quest seed. Each story campaign marks
// exactly one quest `startActive`; that quest is seeded as `active` at session
// start (so the player begins with direction) while every other quest stays
// hidden from the log until discovered.

import type { CampaignFacts, CampaignState, Quest } from '../../types.js';
import { describe, expect, it } from 'vitest';
import {
  evaluateQuestSteps,
  extractCampaignDelta,
  mergeCampaignIntoGameState,
  starterQuestProgress,
} from '../../services/campaignEngine.js';
import { makeState } from '../../test-fixtures.js';

// A fully-populated CampaignFacts baseline; tests override the fields they probe.
const FACTS: CampaignFacts = {
  action: 'marker_move',
  room_id: '',
  current_town_id: '',
  location_id: '',
  enemies_killed: [],
  loot_taken: [],
  visited_rooms: [],
  flags: {},
  campaign_flags: {},
  quest_progress: [],
  faction_rep: {},
  world_minute: 480,
  world_day: 1,
  active_level: 1,
  active_class: 'Fighter',
};

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

describe('bare-leaf quest conditions evaluate (DB-authored shape)', () => {
  // DB quest authors (and the dialogue-side sync evaluator) write bare
  // {fact, operator, value} conditions; json-rules-engine demands an
  // all/any/not root — evaluateQuestSteps wraps transparently.
  const quest: Quest = {
    id: 'rat-problem',
    title: 'The Rat Problem',
    desc: 'x',
    steps: [
      {
        id: 'step_kill',
        desc: 'x',
        condition: { fact: 'enemies_killed', operator: 'contains', value: 'cellar#0' },
      },
    ],
    rewards: [],
  };
  const cs = (): CampaignState => ({
    campaign_id: 'c',
    user_id: 'u',
    world_minute: 480,
    current_location: '',
    quests: [{ questId: 'rat-problem', status: 'active', completedSteps: [] }],
    flags: {},
    faction_rep: {},
    npc_attitudes: {},
  });

  it('a bare leaf works at the root of a step condition', async () => {
    const miss = await evaluateQuestSteps(cs(), [quest], { ...FACTS, enemies_killed: [] });
    expect(miss).toEqual([]);
    const hit = await evaluateQuestSteps(cs(), [quest], {
      ...FACTS,
      enemies_killed: ['cellar#0'],
    });
    expect(hit.find((c) => c.questId === 'rat-problem')?.completedStepIds).toEqual(['step_kill']);
  });
});

describe('world_minute round-trips through merge/extract', () => {
  const cs = (worldMinute: number): CampaignState => ({
    campaign_id: 'c',
    user_id: 'u',
    world_minute: worldMinute,
    current_location: '',
    flags: {},
    quests: [],
    faction_rep: {},
    npc_attitudes: {},
  });

  it('merge pulls the clock from CampaignState when the GameState has none', () => {
    const merged = mergeCampaignIntoGameState(makeState(), cs(2000));
    expect(merged.world_minute).toBe(2000);
  });

  it('extract writes the GameState clock back into the campaign delta', () => {
    const gs = makeState({}, { world_minute: 3333 });
    expect(extractCampaignDelta(cs(0), gs).world_minute).toBe(3333);
  });
});
