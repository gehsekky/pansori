// Regression tests for the Monk Flurry / Colossus Slayer / Vow of Enmity
// bug class: handlers previously used `ctx.roomId` as the enemy entity
// lookup, which never matched (entity IDs are `${roomId}#0`, not the
// room id itself). Flurry's damage path silently no-op'd; Colossus
// Slayer wrote a stale id to `enemies_killed` and ended combat early;
// Vow of Enmity set `vow_of_enmity_target` to the room id so the
// downstream `toHit.ts` advantage check never fired.
//
// All three handlers now key off `ctx.enemy?.id`. These tests pin the
// fix: damage actually applies, kill bookkeeping uses the correct
// enemy id, and `endCombatState` is gated behind `isRoomCleared` so
// multi-enemy rooms don't end combat prematurely.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;
const enemy2Id = `entry_hall#1`;

const seedWithOneGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Bug Test',
  ship_name: 'Bug Test',
  intro: '',
  seed_id: 'bug-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: enemyId, name: 'Goblin', hp: 50, ac: 10, damage: '1d6', toHit: 3, xp: 20 },
    ],
  },
  loot: {},
  npcs: {},
};

const seedWithTwoGoblins: Seed = {
  context_id: ctx.id,
  world_name: 'Bug Test',
  ship_name: 'Bug Test',
  intro: '',
  seed_id: 'bug-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      // Make the first goblin frail so a single Flurry kills it; second is
      // bigger so the room isn't cleared.
      { id: enemyId, name: 'Goblin', hp: 5, ac: 10, damage: '1d6', toHit: 3, xp: 20 },
      { id: enemy2Id, name: 'Hobgoblin', hp: 50, ac: 12, damage: '1d8', toHit: 4, xp: 30 },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Flurry of Blows — entity lookup uses ctx.enemy.id', () => {
  it('actually deals damage to the enemy', async () => {
    // Force d20 high so each strike hits.
    mockRandom(0.99, 0.99, 0.99, 0.99, 0.99, 0.99);
    const monk = makeChar({
      id: 'mk-1',
      character_class: 'Monk',
      level: 3,
      dex: 16,
      class_resource_uses: { ki_points: 3 },
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state = {
      ...makeState({ id: 'mk-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [monk],
      active_character_id: 'mk-1',
      initiative_order: [
        { id: 'mk-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'mk-1',
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
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'flurry_of_blows' },
      history: [],
      state,
      seed: seedWithOneGoblin,
      context: ctx,
    });
    const goblinEnt = result.newState.entities?.find((e) => e.id === enemyId);
    // Pre-fix, the lookup `e.id === ctx.roomId` never matched the goblin so
    // its HP stayed at 50. After the fix, both strikes land and HP drops.
    expect(goblinEnt && goblinEnt.hp < 50).toBe(true);
    expect(result.narrative).toMatch(/hit/i);
  });

  it('records the kill against the enemy id, not the room id', async () => {
    mockRandom(0.99, 0.99, 0.99, 0.99, 0.99, 0.99);
    const monk = makeChar({
      id: 'mk-1',
      character_class: 'Monk',
      level: 5,
      dex: 18,
      class_resource_uses: { ki_points: 3 },
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state = {
      ...makeState({ id: 'mk-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [monk],
      active_character_id: 'mk-1',
      initiative_order: [
        { id: 'mk-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'mk-1',
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
          hp: 5,
          maxHp: 5,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'flurry_of_blows' },
      history: [],
      state,
      seed: {
        ...seedWithOneGoblin,
        enemies: {
          ['entry_hall']: [{ ...seedWithOneGoblin.enemies['entry_hall'][0], hp: 5 }],
        },
      },
      context: ctx,
    });
    expect(result.newState.enemies_killed).toContain(enemyId);
    expect(result.newState.enemies_killed).not.toContain('entry_hall');
  });

  it('does NOT end combat when other enemies remain in the room', async () => {
    mockRandom(0.99, 0.99, 0.99, 0.99, 0.99, 0.99);
    const monk = makeChar({
      id: 'mk-1',
      character_class: 'Monk',
      level: 5,
      dex: 18,
      class_resource_uses: { ki_points: 3 },
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state = {
      ...makeState({ id: 'mk-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [monk],
      active_character_id: 'mk-1',
      initiative_order: [
        { id: 'mk-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
        { id: enemy2Id, roll: 3, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'mk-1',
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
          hp: 5,
          maxHp: 5,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemy2Id,
          isEnemy: true,
          pos: { x: 7, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'flurry_of_blows' },
      history: [],
      state,
      seed: seedWithTwoGoblins,
      context: ctx,
    });
    // Pre-fix, `endCombatState` was called unconditionally after a kill,
    // ending combat even though the hobgoblin was still alive.
    expect(result.newState.combat_active).toBe(true);
    expect(result.newState.enemies_killed).toContain(enemyId);
  });
});
