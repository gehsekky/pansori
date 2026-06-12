// Acts: the reusable LootEffect (grant/revoke scoped to required members) and
// the act transition (a completed trigger quest advances the act — relocating
// the party, firing act loot + onStart, activating the next act's quests).

import type { Context, Seed } from '../../types.js';
import {
  advanceActIfTriggered,
  applyConsequence,
  applyLootEffect,
} from '../../services/gameEngine.js';
import { describe, expect, it } from 'vitest';
import { context as base } from '../fixtures/testContext.js';
import { makeState } from '../../test-fixtures.js';

const seed = {
  context_id: base.id,
  world_name: 'x',
  ship_name: 'x',
  intro: '',
  seed_id: 's',
  rooms: [],
  enemies: {},
  loot: {},
  npcs: {},
} as unknown as Seed;

// A context with two acts (act-1 triggers off quest q1; act-2 grants Roland a
// dagger on entry + activates its startActive quest) and Roland as a required
// member. `dagger` is in the fixture lootTable.
function actCtx(): Context {
  return {
    ...base,
    campaign: {
      ...(base.campaign ?? { world_name: 'x', intro: '', rooms: [] }),
      requiredMembers: [{ name: 'Roland', cls: 'Fighter' }],
      regions: [
        { id: 'r1', name: 'Act I region', gridWidth: 4, gridHeight: 4, startPos: { x: 0, y: 0 } },
        { id: 'r2', name: 'Act II region', gridWidth: 4, gridHeight: 4, startPos: { x: 0, y: 0 } },
      ],
      acts: [
        {
          id: 'act-1',
          name: 'Act I',
          startingRegionId: 'r1',
          startPos: { x: 0, y: 0 },
          trigger: { questId: 'q1' },
        },
        {
          id: 'act-2',
          name: 'Act II',
          startingRegionId: 'r2',
          startPos: { x: 2, y: 1 },
          onStart: 'The siege begins.',
          startEffect: { grant: [{ itemId: 'dagger', member: 'Roland' }] },
        },
      ],
      quests: [
        {
          id: 'q2act',
          actId: 'act-2',
          title: 'Hold the wall',
          desc: 'd',
          steps: [{ id: 's', desc: 'x', condition: {} }],
          rewards: [],
          startActive: true,
        },
      ],
    },
  } as unknown as Context;
}

const roland = () => makeState({ id: 'pc-1', name: 'Roland', character_class: 'Fighter' });

// Minimal CampaignFacts for the edge evaluator (the legacy trigger reads
// quests_completed; transition `when`s read flags/quests/etc.).
const facts = (over: Record<string, unknown> = {}) =>
  ({ quests_completed: [], steps_done: [], flags: {}, ...over }) as unknown as Parameters<
    typeof advanceActIfTriggered
  >[3];

describe('applyLootEffect (required-member scoped)', () => {
  it('grants an item to the named required member; revokes it back', () => {
    const ctx = actCtx();
    let st = roland();
    const parts: string[] = [];
    st = applyLootEffect({ grant: [{ itemId: 'dagger', member: 'Roland' }] }, st, seed, ctx, parts);
    expect(st.characters[0].inventory.some((i) => i.id === 'dagger')).toBe(true);
    st = applyLootEffect(
      { revoke: [{ itemId: 'dagger', member: 'Roland' }] },
      st,
      seed,
      ctx,
      parts
    );
    expect(st.characters[0].inventory.some((i) => i.id === 'dagger')).toBe(false);
  });

  it('skips members who are not required (name+class must match requiredMembers)', () => {
    const ctx = actCtx();
    // A character whose name matches but class does NOT — not a required member.
    const st0 = makeState({ id: 'pc-1', name: 'Roland', character_class: 'Wizard' });
    const st = applyLootEffect(
      { grant: [{ itemId: 'dagger', member: 'Roland' }] },
      st0,
      seed,
      ctx,
      []
    );
    expect(st.characters[0].inventory.some((i) => i.id === 'dagger')).toBe(false);
  });
});

describe('advanceActIfTriggered', () => {
  it('advances when the current act trigger quest completes: relocates + acts loot + activates next quests', () => {
    const ctx = actCtx();
    const st0 = { ...roland(), current_act: 'act-1', current_region_id: 'r1' };
    const parts: string[] = [];
    const st = advanceActIfTriggered(st0, seed, ctx, facts({ quests_completed: ['q1'] }), parts);
    expect(st.current_act).toBe('act-2');
    expect(st.current_region_id).toBe('r2'); // relocated to act-2's region
    expect(st.marker_pos).toEqual({ x: 2, y: 1 }); // at act-2's startPos
    expect(st.characters[0].inventory.some((i) => i.id === 'dagger')).toBe(true); // act-2 startEffect
    // act-2's startActive quest is now active.
    expect(st.quest_progress?.some((p) => p.questId === 'q2act' && p.status === 'active')).toBe(
      true
    );
    expect(parts.join(' ')).toContain('The siege begins.');
  });

  it('does nothing when the completed quest is not the act trigger', () => {
    const ctx = actCtx();
    const st0 = { ...roland(), current_act: 'act-1', current_region_id: 'r1' };
    const st = advanceActIfTriggered(
      st0,
      seed,
      ctx,
      facts({ quests_completed: ['some-other-quest'] }),
      []
    );
    expect(st.current_act).toBe('act-1');
    expect(st.current_region_id).toBe('r1');
  });

  it('does nothing on the final act (no next act to advance to)', () => {
    const ctx = actCtx();
    const st0 = { ...roland(), current_act: 'act-2', current_region_id: 'r2' };
    const st = advanceActIfTriggered(st0, seed, ctx, facts({ quests_completed: ['q1'] }), []);
    expect(st.current_act).toBe('act-2');
  });
});

// A branching context: act-1 has two conditioned edges (peace → act-2, war →
// the terminal act-war ending); the WAR edge is first so it wins on a tie.
function branchCtx(): Context {
  return {
    ...base,
    campaign: {
      ...(base.campaign ?? { world_name: 'x', intro: '', rooms: [] }),
      regions: [
        { id: 'r1', name: 'R1', gridWidth: 4, gridHeight: 4, startPos: { x: 0, y: 0 } },
        { id: 'r2', name: 'R2', gridWidth: 4, gridHeight: 4, startPos: { x: 0, y: 0 } },
        { id: 'r-war', name: 'War', gridWidth: 4, gridHeight: 4, startPos: { x: 0, y: 0 } },
      ],
      acts: [
        {
          id: 'act-1',
          name: 'Act I',
          startingRegionId: 'r1',
          startPos: { x: 0, y: 0 },
          transitions: [
            {
              when: { fact: 'flags', path: '$.war', operator: 'equal', value: true },
              to: 'act-war',
            },
            {
              when: { fact: 'flags', path: '$.peace', operator: 'equal', value: true },
              to: 'act-2',
            },
          ],
        },
        { id: 'act-2', name: 'Act II', startingRegionId: 'r2', startPos: { x: 0, y: 0 } },
        {
          id: 'act-war',
          name: 'The Battle of Silverford',
          startingRegionId: 'r-war',
          startPos: { x: 0, y: 0 },
          ending: { outcome: 'War', text: 'The armies clash; the trail goes cold.' },
        },
      ],
    },
  } as unknown as Context;
}

describe('advanceActIfTriggered — branching edges + endings', () => {
  const at = (act: string) => ({ ...roland(), current_act: act, current_region_id: 'r1' });

  it('a transition edge fires when its `when` holds (peace → act-2)', () => {
    const st = advanceActIfTriggered(
      at('act-1'),
      seed,
      branchCtx(),
      facts({ flags: { peace: true } }),
      []
    );
    expect(st.current_act).toBe('act-2');
    expect(st.current_region_id).toBe('r2');
    expect(st.campaign_outcome).toBeUndefined();
  });

  it('entering a terminal act resolves the campaign (campaign_outcome set)', () => {
    const parts: string[] = [];
    const st = advanceActIfTriggered(
      at('act-1'),
      seed,
      branchCtx(),
      facts({ flags: { war: true } }),
      parts
    );
    expect(st.current_act).toBe('act-war');
    expect(st.campaign_outcome).toEqual({
      outcome: 'War',
      text: 'The armies clash; the trail goes cold.',
    });
    expect(parts.join(' ')).toContain('The armies clash');
  });

  it('an act transition closes a mid-dialogue conversation (no dangling overlay)', () => {
    // Act transitions usually FIRE from a dialogue consequence (the Silverford
    // truce/war choice). The conversation must not survive into the new act —
    // its NPC/room is gone, and a dangling pointer left the dialogue overlay
    // looping on ambient choices (the set-travel-pace incident, 2026-06-14).
    const st0 = {
      ...at('act-1'),
      active_conversation: {
        npcId: 'vane',
        roomId: 'vane_command',
        nodePath: ['truce'],
        prompt: 'Vane waits.',
      },
    };
    const st = advanceActIfTriggered(st0, seed, branchCtx(), facts({ flags: { war: true } }), []);
    expect(st.current_act).toBe('act-war');
    expect(st.active_conversation).toBeUndefined();
  });

  it('the FIRST matching edge wins (war beats peace on a tie)', () => {
    const st = advanceActIfTriggered(
      at('act-1'),
      seed,
      branchCtx(),
      facts({ flags: { war: true, peace: true } }),
      []
    );
    expect(st.current_act).toBe('act-war');
  });

  it('no edge matches → stays put', () => {
    const st = advanceActIfTriggered(at('act-1'), seed, branchCtx(), facts({ flags: {} }), []);
    expect(st.current_act).toBe('act-1');
  });

  it('a resolved campaign does not transition again', () => {
    const st0 = { ...at('act-war'), campaign_outcome: { outcome: 'War' } };
    const st = advanceActIfTriggered(st0, seed, branchCtx(), facts({ flags: { peace: true } }), []);
    expect(st.current_act).toBe('act-war'); // unchanged
  });
});

describe('adjust_flag consequence', () => {
  it('changes a numeric flag relatively (unset → 0 baseline)', () => {
    const ctx = actCtx();
    const base = roland();
    const cid = base.characters[0].id;
    let st = applyConsequence(
      { type: 'adjust_flag', key: 'time_blocks', delta: -1 },
      { ...base, flags: { time_blocks: 6 } },
      seed,
      cid,
      [],
      ctx
    );
    expect(st.flags.time_blocks).toBe(5);
    st = applyConsequence(
      { type: 'adjust_flag', key: 'friction', delta: 2 },
      st,
      seed,
      cid,
      [],
      ctx
    );
    expect(st.flags.friction).toBe(2); // unset → 0, +2
  });
});
