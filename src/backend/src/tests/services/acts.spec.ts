// Acts: the reusable LootEffect (grant/revoke scoped to required members) and
// the act transition (a completed trigger quest advances the act — relocating
// the party, firing act loot + onStart, activating the next act's quests).

import type { Context, Seed } from '../../types.js';
import { advanceActIfTriggered, applyLootEffect } from '../../services/gameEngine.js';
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
    const st = advanceActIfTriggered(st0, seed, ctx, ['q1'], parts);
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
    const st = advanceActIfTriggered(st0, seed, ctx, ['some-other-quest'], []);
    expect(st.current_act).toBe('act-1');
    expect(st.current_region_id).toBe('r1');
  });

  it('does nothing on the final act (no next act to advance to)', () => {
    const ctx = actCtx();
    const st0 = { ...roland(), current_act: 'act-2', current_region_id: 'r2' };
    const st = advanceActIfTriggered(st0, seed, ctx, ['q1'], []);
    expect(st.current_act).toBe('act-2');
  });
});
