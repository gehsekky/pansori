// Dialogue gating — the synchronous condition evaluator, the derived
// progress facts, and the visibility filter (condition + once) that hides
// locked dialogue options while preserving their unfiltered-tree indices.

import type { Context, Faction, PlacedNpc } from '../types.js';
import {
  derivedProgressFacts,
  evalCondition,
  onceKey,
  visibleResponses,
} from './dialogueGating.js';
import { describe, expect, it } from 'vitest';
import { context as ctx } from '../campaignData/sandbox.js';
import { makeState } from '../test-fixtures.js';

describe('evalCondition (sync json-rules-engine subset)', () => {
  const facts = {
    quests_active: ['rat-problem'],
    steps_done: ['rat-problem:step_kill'],
    flags: { met_hob: true, rumor_level: 3 },
    faction_rep: { millers: 25 },
    faction_tier: { millers: 'friendly' },
    party_items: ['ledger'],
    active_level: 4,
  };

  it('leaf operators behave like json-rules-engine', () => {
    expect(
      evalCondition({ fact: 'quests_active', operator: 'contains', value: 'rat-problem' }, facts)
    ).toBe(true);
    expect(
      evalCondition({ fact: 'quests_active', operator: 'doesNotContain', value: 'other' }, facts)
    ).toBe(true);
    expect(evalCondition({ fact: 'active_level', operator: 'equal', value: 4 }, facts)).toBe(true);
    expect(evalCondition({ fact: 'active_level', operator: 'notEqual', value: 4 }, facts)).toBe(
      false
    );
    expect(
      evalCondition({ fact: 'active_level', operator: 'greaterThanInclusive', value: 4 }, facts)
    ).toBe(true);
    expect(evalCondition({ fact: 'active_level', operator: 'greaterThan', value: 4 }, facts)).toBe(
      false
    );
    expect(evalCondition({ fact: 'active_level', operator: 'lessThan', value: 5 }, facts)).toBe(
      true
    );
    expect(
      evalCondition({ fact: 'active_level', operator: 'lessThanInclusive', value: 3 }, facts)
    ).toBe(false);
    expect(evalCondition({ fact: 'active_level', operator: 'in', value: [2, 4, 6] }, facts)).toBe(
      true
    );
    expect(
      evalCondition({ fact: 'active_level', operator: 'notIn', value: [2, 4, 6] }, facts)
    ).toBe(false);
  });

  it('`path` digs into object facts ($.dot.path)', () => {
    expect(
      evalCondition({ fact: 'flags', path: '$.met_hob', operator: 'equal', value: true }, facts)
    ).toBe(true);
    expect(
      evalCondition(
        { fact: 'faction_rep', path: '$.millers', operator: 'greaterThanInclusive', value: 20 },
        facts
      )
    ).toBe(true);
    expect(
      evalCondition(
        { fact: 'faction_tier', path: '$.millers', operator: 'equal', value: 'friendly' },
        facts
      )
    ).toBe(true);
  });

  it('all / any / not nest recursively', () => {
    const gate = {
      all: [
        { fact: 'quests_active', operator: 'contains', value: 'rat-problem' },
        {
          any: [
            { fact: 'active_level', operator: 'greaterThan', value: 10 },
            { fact: 'party_items', operator: 'contains', value: 'ledger' },
          ],
        },
        { not: { fact: 'flags', path: '$.banned', operator: 'equal', value: true } },
      ],
    };
    expect(evalCondition(gate, facts)).toBe(true);
    expect(
      evalCondition({ all: [{ fact: 'active_level', operator: 'greaterThan', value: 10 }] }, facts)
    ).toBe(false);
  });

  it('fails closed: malformed input, unknown operators, missing facts', () => {
    expect(evalCondition(null, facts)).toBe(false);
    expect(evalCondition('nonsense', facts)).toBe(false);
    expect(evalCondition({}, facts)).toBe(false);
    expect(evalCondition({ fact: 'active_level', operator: 'looksLike', value: 4 }, facts)).toBe(
      false
    );
    expect(evalCondition({ fact: 'no_such_fact', operator: 'equal', value: 1 }, facts)).toBe(false);
    // ...but a not-wrapper over a failing leaf still works (not(false) = true).
    expect(
      evalCondition({ not: { fact: 'no_such_fact', operator: 'equal', value: 1 } }, facts)
    ).toBe(true);
  });
});

describe('derivedProgressFacts', () => {
  const FACTION: Faction = {
    id: 'millers',
    name: "The Millers' Guild",
    thresholds: { hostile: -20, unfriendly: -5, neutral: 0, friendly: 20, exalted: 50 },
    shopPriceModifiers: {},
  };
  const fakeCtx = { campaign: { factions: [FACTION] } } as unknown as Context;

  it('flattens quest progress into status lists + step keys', () => {
    const progress = [
      { questId: 'rat-problem', status: 'active' as const, completedSteps: ['step_talk'] },
      { questId: 'old-debt', status: 'completed' as const, completedSteps: ['s1', 's2'] },
      { questId: 'lost-cause', status: 'failed' as const, completedSteps: [] },
    ];
    const d = derivedProgressFacts(progress, {}, fakeCtx);
    expect(d.quests_active).toEqual(['rat-problem']);
    expect(d.quests_completed).toEqual(['old-debt']);
    expect(d.steps_done).toEqual(['rat-problem:step_talk', 'old-debt:s1', 'old-debt:s2']);
  });

  it('resolves faction rep to named tiers via the faction thresholds', () => {
    expect(derivedProgressFacts([], { millers: 25 }, fakeCtx).faction_tier).toEqual({
      millers: 'friendly',
    });
    expect(derivedProgressFacts([], { millers: -30 }, fakeCtx).faction_tier).toEqual({
      millers: 'hostile',
    });
    // Unmet faction defaults to rep 0 → its neutral tier.
    expect(derivedProgressFacts([], {}, fakeCtx).faction_tier).toEqual({ millers: 'neutral' });
  });
});

describe('visibleResponses', () => {
  const npc: PlacedNpc = {
    roomId: 'parley',
    id: 'sage',
    name: 'The Sage',
    attitude: 'friendly',
    hp: 4,
    ac: 10,
    damage: '1d4',
    toHit: 0,
    xp: 0,
    greeting: 'Ask.',
    responses: [
      { label: 'Always here' },
      {
        label: 'Quest-gated',
        condition: { fact: 'quests_active', operator: 'contains', value: 'rat-problem' },
      },
      { label: 'One-shot', once: true },
      { label: 'Broken gate', condition: { fact: 'x', operator: 'looksLike', value: 1 } },
    ],
  };

  it('hides unmet conditions + spent once-options, keeping ORIGINAL indices', () => {
    const st = makeState({ id: 'pc-1' }, { current_room: 'parley' });
    // No active quest, nothing chosen: gated + broken hidden, indices 0 and 2 survive.
    const vis = visibleResponses(npc, [], st, ctx);
    expect(vis.map((v) => [v.response.label, v.idx])).toEqual([
      ['Always here', 0],
      ['One-shot', 2],
    ]);
  });

  it('a met condition reveals the option at its original index', () => {
    const st = makeState(
      { id: 'pc-1' },
      {
        current_room: 'parley',
        quest_progress: [{ questId: 'rat-problem', status: 'active', completedSteps: [] }],
      }
    );
    const vis = visibleResponses(npc, [], st, ctx);
    expect(vis.map((v) => v.idx)).toEqual([0, 1, 2]);
  });

  it('a chosen once-option disappears (dialogue_chosen)', () => {
    const st = makeState(
      { id: 'pc-1' },
      { current_room: 'parley', dialogue_chosen: [onceKey('sage', [], 2)] }
    );
    const vis = visibleResponses(npc, [], st, ctx);
    expect(vis.map((v) => v.idx)).toEqual([0]);
  });
});
