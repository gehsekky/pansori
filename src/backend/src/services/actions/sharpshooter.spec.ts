// Sharpshooter feat — per-turn toggle for the -5/+10 tradeoff on
// ranged-weapon attacks. Tests the `toggle_sharpshooter` action's
// validation + flag flip, and the attack-handler hooks (penalty
// folded into to-hit, +10 into damage, cover suppression).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Sharpshooter Test',
  ship_name: 'Sharpshooter Test',
  intro: '',
  seed_id: 'sharpshooter-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 60,
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

const buildRanger = (sharpshooterActive = false) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    level: 5,
    str: 10,
    dex: 18,
    feats: ['sharpshooter'],
    inventory: [
      { instance_id: 'bow-1', id: 'shortbow', name: 'Shortbow' },
      { instance_id: 'arrow-1', id: 'arrows', name: 'Arrows', count: 20 },
    ],
    equipped_weapon: 'bow-1',
    weapon_proficiencies: ['simple', 'martial'],
    turn_actions: {
      action_used: false,
      bonus_action_used: false,
      reaction_used: false,
      free_interaction_used: false,
      sharpshooter_active: sharpshooterActive,
    },
  });

describe('toggle_sharpshooter — validation + state', () => {
  it('rejects when the PC does not have the Sharpshooter feat', async () => {
    const state = makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId });
    const result = await takeAction({
      action: { type: 'toggle_sharpshooter' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/does not have the Sharpshooter feat/);
    expect(result.newState.characters[0].turn_actions.sharpshooter_active).toBeFalsy();
  });

  it('toggles the flag on when off', async () => {
    const ranger = buildRanger(false);
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [ranger],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'toggle_sharpshooter' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.newState.characters[0].turn_actions.sharpshooter_active).toBe(true);
    expect(result.narrative).toMatch(/Sharpshooter armed/);
    // No action-economy cost.
    expect(result.newState.characters[0].turn_actions.action_used).toBe(false);
  });

  it('toggles back off when on', async () => {
    const ranger = buildRanger(true);
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [ranger],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'toggle_sharpshooter' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.newState.characters[0].turn_actions.sharpshooter_active).toBe(false);
    expect(result.narrative).toMatch(/disengaged/);
  });
});

describe('Sharpshooter — attack hooks', () => {
  it('applies -5 to-hit and +10 damage on a ranged hit, surfaces the bonus', async () => {
    // d(20) = Math.floor(Math.random()*20) + 1. 0.99 → 20 (auto-hit even with -5).
    // Damage: shortbow = 1d6 (random 0.99 → 6) + DEX mod (+4) + Sharpshooter +10 = 20.
    // Pad enough Math.random calls for the d20, damage roll, then anything else.
    mockRandom(0.99, 0.99, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
    const ranger = buildRanger(true);
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [ranger],
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
          pos: { x: 0, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 60,
          maxHp: 60,
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
    expect(result.narrative).toMatch(/Sharpshooter: \+10/);
    // -5 visible in the to-hit math (sharpshooterPenalty folded into
    // totalAttackBonus): d20 20 + DEX(+4) + prof(+3) − 5 = 22 vs AC 15.
    expect(result.narrative).toMatch(/-5 to hit/);
    // Damage actually applied: enemy HP dropped from 60 to lower.
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId);
    expect(enemyEnt && enemyEnt.hp < 60).toBe(true);
  });

  it('does not apply Sharpshooter to melee weapons even when flag is on', async () => {
    mockRandom(0.99, 0.5, 0.5, 0.5, 0.5);
    const ranger = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      feats: ['sharpshooter'],
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        sharpshooter_active: true,
      },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [ranger],
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
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 60,
          maxHp: 60,
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
    // No Sharpshooter bonus on a melee weapon.
    expect(result.narrative).not.toMatch(/Sharpshooter/);
  });
});
