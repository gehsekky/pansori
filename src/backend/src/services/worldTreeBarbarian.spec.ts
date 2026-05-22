// World Tree Barbarian (2024 PHB Path of the World Tree) — L3
// Vitality of the Tree. On rage start, gain (barbarian level)
// temp HP.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'World Tree Test',
  ship_name: 'World Tree Test',
  intro: '',
  seed_id: 'world-tree',
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

function buildBarbarian(subclass: string) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    subclass,
    level: 5,
    str: 18,
    hp: 30,
    max_hp: 30,
    class_resource_uses: { rage_uses: 3 },
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

describe('World Tree Barbarian — Vitality of the Tree', () => {
  it('Rage start: World Tree Barbarian gains temp HP = barb level', async () => {
    const pc = buildBarbarian('world_tree');
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'rage' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.temp_hp).toBe(5); // barb level 5
    expect(result.narrative).toMatch(/Vitality of the Tree/);
  });

  it('Berserker raging (control): no temp HP from rage', async () => {
    const pc = buildBarbarian('berserker');
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'rage' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.temp_hp ?? 0).toBe(0);
    expect(result.narrative).not.toMatch(/Vitality of the Tree/);
  });
});
