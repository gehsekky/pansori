// Zealot Barbarian (2024 PHB Path of the Zealot) — L3 Divine
// Fury damage rider. While raging, first weapon attack of the
// turn deals +1d6 + (barb lvl / 2) radiant.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Zealot Test',
  ship_name: 'Zealot Test',
  intro: '',
  seed_id: 'zealot',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
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

function buildBarbarian(opts: { subclass: string; raging?: boolean }) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    subclass: opts.subclass,
    level: 5,
    str: 18,
    hp: 30,
    max_hp: 30,
    conditions: opts.raging ? ['raging'] : [],
    inventory: [{ instance_id: 'sw-1', id: 'greataxe', name: 'Greataxe' }],
    equipped_weapon: 'sw-1',
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
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Zealot Barbarian — Divine Fury', () => {
  it('Zealot raging hit: Divine Fury fires', async () => {
    mockRandom(0.99);
    const pc = buildBarbarian({ subclass: 'zealot', raging: true });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Divine Fury: \+\d+ radiant/);
  });

  it('Zealot NOT raging: no Divine Fury', async () => {
    mockRandom(0.99);
    const pc = buildBarbarian({ subclass: 'zealot', raging: false });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Divine Fury/);
  });

  it('Berserker raging (control): no Divine Fury', async () => {
    mockRandom(0.99);
    const pc = buildBarbarian({ subclass: 'berserker', raging: true });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Divine Fury/);
  });
});
