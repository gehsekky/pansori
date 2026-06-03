// starterQuestProgress — the opening-quest seed. Each story campaign marks
// exactly one quest `startActive`; that quest is seeded as `active` at session
// start (so the player begins with direction) while every other quest stays
// hidden from the log until discovered.

import type { CampaignFacts, CampaignState, Quest } from '../types.js';
import { describe, expect, it } from 'vitest';
import {
  evaluateQuestSteps,
  extractCampaignDelta,
  mergeCampaignIntoGameState,
  starterQuestProgress,
} from './campaignEngine.js';
import { makeState } from '../test-fixtures.js';
import { context as vale } from '../campaignData/malgovia/index.js';

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

// Recursively collect every `fact` name a json-rules-engine condition references
// (walking all/any/not branches). Used to verify quests only key on facts the
// engine actually supplies.
function collectFacts(cond: unknown, out: Set<string>): void {
  if (!cond || typeof cond !== 'object') return;
  const c = cond as Record<string, unknown>;
  if (typeof c.fact === 'string') out.add(c.fact);
  for (const key of ['all', 'any', 'not'] as const) {
    const sub = c[key];
    if (Array.isArray(sub)) sub.forEach((s) => collectFacts(s, out));
    else if (sub) collectFacts(sub, out);
  }
}

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

describe('quest conditions only reference facts the engine supplies', () => {
  // A representative CampaignFacts — `satisfies` keeps its keys in lockstep with
  // the type, so the known-fact set can't drift. Every fact a quest condition
  // names must be one of these, or json-rules-engine throws "Undefined fact: …"
  // at runtime (the bug that hid the Silent Grove behind `visited_rooms`).
  const KNOWN_FACTS = new Set(
    Object.keys({
      action: '',
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
      world_minute: 0,
      world_day: 0,
      active_level: 0,
      active_class: '',
    } satisfies CampaignFacts)
  );

  it('Malgovia quests key only on supplied facts (no "Undefined fact")', () => {
    const referenced = new Set<string>();
    for (const q of vale.campaign?.quests ?? []) {
      for (const step of q.steps) collectFacts(step.condition, referenced);
    }
    // Sanity: we actually walked some conditions (incl. the grove's visited_rooms).
    expect(referenced.has('visited_rooms')).toBe(true);
    const missing = [...referenced].filter((f) => !KNOWN_FACTS.has(f));
    expect(missing).toEqual([]);
  });
});

describe('story campaigns each open with exactly one starter quest', () => {
  const cases: { name: string; quests: Quest[]; opener: string }[] = [
    { name: 'Malgovia', quests: vale.campaign?.quests ?? [], opener: 'quest_arrival' },
  ];
  for (const c of cases) {
    it(`${c.name} → ${c.opener} is the sole startActive quest`, () => {
      const starters = c.quests.filter((q) => q.startActive);
      expect(starters.map((q) => q.id)).toEqual([c.opener]);
    });
  }
});

describe('the opening arrival quest completes on reaching Pinegate', () => {
  const quests = vale.campaign?.quests ?? [];
  const cs = (): CampaignState => ({
    campaign_id: vale.id,
    user_id: 'u',
    world_minute: 480,
    current_location: '',
    quests: starterQuestProgress(quests), // seeds quest_arrival as active
    flags: {},
    faction_rep: {},
    npc_attitudes: {},
  });

  it('quest_arrival is the seeded opener', () => {
    expect(starterQuestProgress(quests).map((q) => q.questId)).toEqual(['quest_arrival']);
  });

  it('step_reach_pinegate completes only once current_town_id is pinegate_town', async () => {
    const notYet = await evaluateQuestSteps(cs(), quests, { ...FACTS, current_town_id: '' });
    expect(notYet.find((c) => c.questId === 'quest_arrival')).toBeUndefined();

    const millhaven = await evaluateQuestSteps(cs(), quests, {
      ...FACTS,
      current_town_id: 'millhaven_town',
    });
    expect(millhaven.find((c) => c.questId === 'quest_arrival')).toBeUndefined();

    const pinegate = await evaluateQuestSteps(cs(), quests, {
      ...FACTS,
      current_town_id: 'pinegate_town',
    });
    expect(pinegate.find((c) => c.questId === 'quest_arrival')?.completedStepIds).toContain(
      'step_reach_pinegate'
    );
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
