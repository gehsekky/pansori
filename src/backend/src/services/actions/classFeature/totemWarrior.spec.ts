// Totem Warrior (Path of the Wild Heart) Barbarian — 2024 PHB.
// At rage activation, picks Bear / Eagle / Wolf:
//   - Bear: resistance narrative (Rage already covers all damage
//     types in pansori's simplification).
//   - Eagle: OAs against the wielder have disadvantage.
//   - Wolf: allies within 5 ft of the target gain advantage on
//     attacks (wired in toHit alongside the existing wolfAdv check).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Totem Warrior Test',
  ship_name: 'Totem Warrior Test',
  intro: '',
  seed_id: 'totem-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 30,
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

function buildBarbarian(opts: { subclass?: string }) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    level: 5,
    str: 16,
    hp: 30,
    max_hp: 30,
    subclass: opts.subclass,
    class_resource_uses: { rage_uses: 3 },
    inventory: [{ instance_id: 'ga-1', id: 'greataxe', name: 'Greataxe' }],
    equipped_weapon: 'ga-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
}

function buildState(pc: ReturnType<typeof makeChar>) {
  return {
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
        hp: 30,
        maxHp: 30,
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
}

describe('Totem Warrior — choice surface', () => {
  it('Totem Warrior surfaces THREE rage variants (Bear / Eagle / Wolf)', () => {
    const pc = buildBarbarian({ subclass: 'totem_warrior' });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const rageChoices = choices.filter(
      (c) =>
        c.action.type === 'use_class_feature' &&
        (c.action.featureId === 'rage_bear' ||
          c.action.featureId === 'rage_eagle' ||
          c.action.featureId === 'rage_wolf')
    );
    expect(rageChoices).toHaveLength(3);
    const featureIds = rageChoices
      .map((c) => (c.action.type === 'use_class_feature' ? c.action.featureId : undefined))
      .filter((x): x is string => !!x)
      .sort();
    expect(featureIds).toEqual(['rage_bear', 'rage_eagle', 'rage_wolf']);
  });

  it('Berserker (non-Totem) surfaces the plain Rage option (one choice)', () => {
    const pc = buildBarbarian({ subclass: 'berserker' });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const rageChoices = choices.filter(
      (c) =>
        c.action.type === 'use_class_feature' &&
        (c.action.featureId === 'rage' ||
          c.action.featureId === 'rage_bear' ||
          c.action.featureId === 'rage_eagle' ||
          c.action.featureId === 'rage_wolf')
    );
    expect(rageChoices).toHaveLength(1);
    expect(rageChoices[0].action).toMatchObject({ featureId: 'rage' });
  });
});

describe('Totem Warrior — totem activation', () => {
  it('Rage as Eagle: sets totem_spirit to "eagle" + raging condition', async () => {
    const pc = buildBarbarian({ subclass: 'totem_warrior' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'rage_eagle' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.conditions).toContain('raging');
    expect(after.totem_spirit).toBe('eagle');
    expect(result.narrative).toMatch(/Eagle/);
  });

  it('Rage as Bear: sets totem_spirit to "bear"', async () => {
    const pc = buildBarbarian({ subclass: 'totem_warrior' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'rage_bear' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].totem_spirit).toBe('bear');
  });

  it('Berserker trying rage_wolf is rejected (wrong subclass)', async () => {
    const pc = buildBarbarian({ subclass: 'berserker' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'rage_wolf' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Only Totem Warrior Barbarians/);
  });
});
