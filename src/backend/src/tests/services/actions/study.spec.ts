// Study action tests — SRD. Creature-analysis branch: INT +
// skill check reveals resistances / vulnerabilities / immunities /
// condition_immunities on success.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

// Skeleton has `vulnerabilities: ['bludgeoning']` + `immunities: ['poison']`
// + `condition_immunities: ['poisoned', 'exhaustion']` in SRD_MONSTERS.
const skeletonSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Study Test',
  ship_name: 'Study Test',
  intro: '',
  seed_id: 'study-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Skeleton',
        hp: 13,
        ac: 13,
        damage: '1d6+2',
        toHit: 4,
        xp: 50,
        vulnerabilities: ['bludgeoning'],
        immunities: ['poison'],
        condition_immunities: ['poisoned', 'exhaustion'],
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('study — creature analysis', () => {
  it('success reveals vulnerabilities, immunities, condition immunities', async () => {
    // High roll: d20 → 20 (mock 0.99), INT 16 (+3), prof +3 with arcana
    // (L5). Total = 20 + 3 + 3 = 26 vs DC 15 (skeleton has no CR set,
    // so defaults to base 15).
    mockRandom(0.99);
    const wizard = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      skill_proficiencies: ['arcana'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wizard],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true as const,
          pos: { x: 5, y: 5 },
          hp: 13,
          maxHp: 13,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'study', skill: 'arcana', targetEnemyId: enemyId },
      history: [],
      state,
      seed: skeletonSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/success/i);
    expect(result.narrative).toMatch(/vulnerable to bludgeoning/);
    expect(result.narrative).toMatch(/immune to poison/);
    expect(result.narrative).toMatch(/cannot be poisoned/);
  });

  it('failure leaves the player without info', async () => {
    mockRandom(0); // d20 → 1
    const wizard = makeChar({ id: 'pc-1', character_class: 'Wizard', int: 10 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wizard],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 4, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true as const,
          pos: { x: 5, y: 5 },
          hp: 13,
          maxHp: 13,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'study', skill: 'history', targetEnemyId: enemyId },
      history: [],
      state,
      seed: skeletonSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/fails to recall/);
    // The narrative should not leak the skeleton's vulnerabilities on a fail.
    expect(result.narrative).not.toMatch(/bludgeoning/);
  });

  it('rejects when no enemy targeted', async () => {
    const char = makeChar({ id: 'pc-1' });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
      characters: [char],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'study', skill: 'investigation' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Empty',
        ship_name: 'Empty',
        intro: '',
        seed_id: 'empty',
        rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    expect(result.narrative).toMatch(/No valid creature to study/i);
  });

  it('accepts a loreTopic with no enemy but only acknowledges it', async () => {
    const char = makeChar({ id: 'pc-1' });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
      characters: [char],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'study', skill: 'history', loreTopic: 'the lost kings of old' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Empty',
        ship_name: 'Empty',
        intro: '',
        seed_id: 'empty',
        rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    expect(result.narrative).toMatch(/lost kings of old/);
    expect(result.narrative).toMatch(/doesn't yet model/);
  });
});
