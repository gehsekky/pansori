// starterQuestProgress — the opening-quest seed. Each story campaign marks
// exactly one quest `startActive`; that quest is seeded as `active` at session
// start (so the player begins with direction) while every other quest stays
// hidden from the log until discovered.

import type { CampaignFacts, Quest } from '../types.js';
import { describe, expect, it } from 'vitest';
import { starterQuestProgress } from './campaignEngine.js';
import { context as vale } from '../campaignData/malgovia/index.js';

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
      location_id: '',
      enemies_killed: [],
      loot_taken: [],
      visited_rooms: [],
      flags: {},
      campaign_flags: {},
      quest_progress: [],
      faction_rep: {},
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
    { name: 'Vale of Shadows', quests: vale.campaign?.quests ?? [], opener: 'quest_shipment' },
  ];
  for (const c of cases) {
    it(`${c.name} → ${c.opener} is the sole startActive quest`, () => {
      const starters = c.quests.filter((q) => q.startActive);
      expect(starters.map((q) => q.id)).toEqual([c.opener]);
    });
  }
});
