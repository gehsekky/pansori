// Divine Smite (spell) + Improved Divine Smite (L11 passive) tests.
// The spell is a bonus-action pre-buff that queues radiant dice on
// the caster's `divine_smite_dice`; the next weapon hit consumes it.
// Improved Divine Smite is an always-on +1d8 radiant for Paladins
// L11+. Both fire in the attack handler's hit branch.

import type { GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../../test-fixtures.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Smite Test',
  ship_name: 'Smite Test',
  intro: '',
  seed_id: 'smite-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

const buildPaladin = (opts: {
  level: number;
  slots: Record<number, number>;
  smiteDice?: number;
}): GameState => {
  const pala = makeChar({
    id: 'pal-1',
    character_class: 'Paladin',
    level: opts.level,
    str: 16,
    spell_slots_max: opts.slots,
    spell_slots_used: {},
    spells_known: ['divine_smite_spell'],
    prepared_spells: ['divine_smite_spell'],
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipment: { main_hand: 'sw-1' },
    divine_smite_dice: opts.smiteDice,
  });
  return {
    ...makeState({ id: 'pal-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pala],
    active_character_id: 'pal-1',
    initiative_order: [
      { id: 'pal-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pal-1',
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
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
};

describe('Divine Smite — bonus-action cast queues smite dice', () => {
  it('cast sets divine_smite_dice = 2 + (slotLevel - 1) and consumes the slot', async () => {
    const state = buildPaladin({ level: 5, slots: { 1: 2, 2: 1 } });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'divine_smite_spell', slotLevel: 2 },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const pal = result.newState.characters[0];
    // Upcast to slot 2 → 2 + 1 = 3 dice.
    expect(pal.divine_smite_dice).toBe(3);
    expect(pal.spell_slots_used?.[2]).toBe(1);
    expect(result.narrative).toMatch(/channels divine power/);
    expect(result.narrative).toMatch(/3d8 radiant/);
  });
});

describe('Divine Smite — next weapon hit consumes the dice', () => {
  it('rolls 2d8 radiant on hit and clears divine_smite_dice', async () => {
    // Force d20 → 20 (auto-hit + crit) and all damage dice high.
    mockRandom(0.99);
    const state = buildPaladin({
      level: 5,
      slots: { 1: 2 },
      smiteDice: 2,
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const pal = result.newState.characters[0];
    // Dice consumed on the hit.
    expect(pal.divine_smite_dice).toBeUndefined();
    // Narrative surfaces the smite bonus.
    expect(result.narrative).toMatch(/Divine Smite/);
    expect(result.narrative).toMatch(/radiant/);
  });

  it('does not consume dice on a miss (mock low roll)', async () => {
    mockRandom(0); // d20 → 1 → miss (fumble)
    // Use L4 Paladin to avoid Extra Attack (L5+) — a second attack
    // would roll an unmocked d20 and might hit, consuming the dice
    // and breaking the assertion. L4 has a single attack action.
    const state = buildPaladin({
      level: 4,
      slots: { 1: 2 },
      smiteDice: 2,
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const pal = result.newState.characters[0];
    // Miss — dice should still be there for next hit.
    expect(pal.divine_smite_dice).toBe(2);
    expect(result.narrative).not.toMatch(/Divine Smite/);
  });
});

describe('Improved Divine Smite (L11+ Paladin)', () => {
  it('adds 1d8 radiant to every weapon hit for Paladins L11+', async () => {
    mockRandom(0.99); // hit + max dice
    const state = buildPaladin({ level: 11, slots: { 1: 2 } });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Improved Divine Smite/);
    expect(result.narrative).toMatch(/radiant/);
  });

  it('does not fire below L11', async () => {
    mockRandom(0.99);
    const state = buildPaladin({ level: 5, slots: { 1: 2 } });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Improved Divine Smite/);
  });

  it('does not fire for non-Paladins at L11', async () => {
    mockRandom(0.99);
    const fighter = makeChar({
      id: 'ftr-1',
      character_class: 'Fighter',
      level: 11,
      str: 16,
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipment: { main_hand: 'sw-1' },
    });
    const state = {
      ...buildPaladin({ level: 11, slots: {} }),
      characters: [fighter],
      active_character_id: 'ftr-1',
      initiative_order: [
        { id: 'ftr-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      entities: [
        {
          id: 'ftr-1',
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
          hp: 50,
          maxHp: 50,
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
    expect(result.narrative).not.toMatch(/Improved Divine Smite/);
  });
});
