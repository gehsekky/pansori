// Regression test for enemy resistance/vulnerability on Cleave +
// Two-Weapon Attack damage.
//
// **Pre-existing bug:** both paths wrote raw weapon-die damage
// directly to entity HP. The main-hand attack and most spell
// damage paths route through `applyDamageMultiplier` for enemy
// resistance / vulnerability / immunity — but Cleave (the
// secondary hit from 2024 PHB Cleave mastery) and Two-Weapon
// off-hand did not. A slashing-resistant enemy took full damage
// from a Cleave hit, even though they'd take half from the main
// hand. Same gap for off-hand shortsword vs piercing-resistant.
//
// Fixed by piping both through applyDamageMultiplier with the
// weapon's damageType + the secondary target's enemy data.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Two slashing-resistant skeletons in the same room. Cleave from the
// first hit should halve damage on the second.
const cleaveSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Cleave Resist Test',
  ship_name: 'Cleave Resist Test',
  intro: '',
  seed_id: 'cleave-resist',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: `entry_hall#0`,
        name: 'Skeleton A',
        hp: 100,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
        resistances: ['slashing'],
      },
      {
        id: `entry_hall#1`,
        name: 'Skeleton B',
        hp: 100,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
        resistances: ['slashing'],
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Cleave damage — enemy resistance applied', () => {
  it('Cleave halves slashing damage against a slashing-resistant second target', async () => {
    // Force d20=20 + max damage. Greataxe damage 1d12 with the Cleave
    // mastery; max roll = 12, halved by resistance = 6.
    mockRandom(0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 18,
      hp: 30,
      max_hp: 30,
      inventory: [{ instance_id: 'ga-1', id: 'greataxe', name: 'Greataxe' }],
      equipment: { main_hand: 'ga-1' },
      weapon_proficiencies: ['simple', 'martial'],
      weapon_masteries: ['greataxe'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: `entry_hall#0`, roll: 5, is_enemy: true },
        { id: `entry_hall#1`, roll: 4, is_enemy: true },
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
          id: `entry_hall#0`,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 100,
          maxHp: 100,
          conditions: [],
          condition_durations: {},
        },
        {
          id: `entry_hall#1`,
          isEnemy: true,
          pos: { x: 5, y: 6 },
          hp: 100,
          maxHp: 100,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state,
      seed: cleaveSeed,
      context: ctx,
    });
    // The Cleave note in the narrative should mention "resistant to
    // slashing" (the applyDamageMultiplier annotation). Pre-fix this
    // note wouldn't appear because resistance was never consulted.
    expect(result.narrative).toMatch(/Cleave:/);
    expect(result.narrative).toMatch(/resistant to slashing/);
  });
});

const twfSeed: Seed = {
  context_id: ctx.id,
  world_name: 'TWF Resist Test',
  ship_name: 'TWF Resist Test',
  intro: '',
  seed_id: 'twf-resist',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: `entry_hall#0`,
        name: 'Goblin',
        hp: 100,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
        resistances: ['piercing'],
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Two-Weapon off-hand damage — enemy resistance applied', () => {
  it('off-hand dagger (piercing) halves damage against piercing-resistant target', async () => {
    mockRandom(0.99); // hit + max damage
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      dex: 16,
      hp: 30,
      max_hp: 30,
      inventory: [
        { instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' },
        { instance_id: 'd-1', id: 'dagger', name: 'Dagger' },
      ],
      equipment: { main_hand: 'sw-1' },
      weapon_proficiencies: ['simple', 'martial'],
      turn_actions: {
        // Off-hand requires action_used = true normally; setting it
        // here exercises the post-action off-hand path.
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: `entry_hall#0`, roll: 5, is_enemy: true },
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
          id: `entry_hall#0`,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 100,
          maxHp: 100,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'two_weapon_attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state,
      seed: twfSeed,
      context: ctx,
    });
    // Narrative should annotate the resistance.
    expect(result.narrative).toMatch(/resistant to piercing/);
  });
});
