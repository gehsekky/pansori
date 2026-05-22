// Lucky feat — spend hook into PC attack rolls. Tests the `use_luck`
// action handler (validation + state mutation) and the toHit hook
// (`turn_actions.luck_pending` consumed and granting advantage on
// the next attack).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Lucky Test',
  ship_name: 'Lucky Test',
  intro: '',
  seed_id: 'lucky-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 30,
        ac: 15,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('use_luck — validation', () => {
  it('rejects when the PC does not have the Lucky feat', async () => {
    const state = makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId });
    const result = await takeAction({
      action: { type: 'use_luck' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/does not have the Lucky feat/);
    expect(result.newState.characters[0].turn_actions.luck_pending).toBeFalsy();
  });

  it('rejects when no luck points remain', async () => {
    const pc = makeChar({
      id: 'pc-1',
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 0 },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'use_luck' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/no luck points remaining/);
    expect(result.newState.characters[0].turn_actions.luck_pending).toBeFalsy();
  });

  it('rejects when luck is already queued', async () => {
    const pc = makeChar({
      id: 'pc-1',
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 3 },
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        luck_pending: true,
      },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'use_luck' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already queued/);
    // Pool unchanged.
    expect(result.newState.characters[0].class_resource_uses?.feat_lucky_uses).toBe(3);
  });
});

describe('use_luck — success', () => {
  it('decrements the luck pool and sets the luck_pending flag', async () => {
    const pc = makeChar({
      id: 'pc-1',
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 3 },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'use_luck' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const next = result.newState.characters[0];
    expect(next.class_resource_uses?.feat_lucky_uses).toBe(2);
    expect(next.turn_actions.luck_pending).toBe(true);
    expect(result.narrative).toMatch(/spends a luck point/);
    expect(result.narrative).toMatch(/2 luck points left/);
    // No action-economy cost.
    expect(next.turn_actions.action_used).toBe(false);
  });

  it('spending the last point reports "0 luck points left" with no plural', async () => {
    const pc = makeChar({
      id: 'pc-1',
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 1 },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'use_luck' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.newState.characters[0].class_resource_uses?.feat_lucky_uses).toBe(0);
    // "0 luck points left" — plural for zero, singular only for 1.
    expect(result.narrative).toMatch(/0 luck points left/);
  });
});

describe('use_luck — attack hook', () => {
  it('grants advantage on the next attack and clears luck_pending', async () => {
    // Bake an attack that would *miss* without advantage but *hit* with it.
    // Goblin AC = 15. PC: STR 14 (+2), level 5 (prof +3 with weapon). Total
    // attack bonus = +5 before the d20. So we need a d20 that fails alone
    // (≤9) but a second d20 that succeeds. Mock: roll1=10 (random 0.45 → 10)
    // misses (10+5=15... actually meets AC). Use roll1=9 (random 0.4→9):
    // 9+5=14 < 15 miss. roll2=15 (random 0.7 → 15): 15+5=20 ≥ 15 hit.
    //
    // d(20) = Math.floor(Math.random() * 20) + 1. So 0.4 → 9, 0.7 → 15.
    // Damage rolls use additional Math.random calls — pad with 0.5s.
    mockRandom(0.4, 0.7, 0.5, 0.5, 0.5, 0.5, 0.5);
    const pc = makeChar({
      id: 'pc-1',
      str: 14,
      level: 5,
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 1 },
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['martial'],
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        luck_pending: true, // pre-queued
      },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    // Flag cleared.
    expect(result.newState.characters[0].turn_actions.luck_pending).toBeFalsy();
    // Advantage surfaced.
    expect(result.narrative).toMatch(/advantage/);
  });
});
