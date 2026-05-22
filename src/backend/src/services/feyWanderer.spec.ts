// Fey Wanderer Ranger (2024 PHB) — Dreadful Strikes damage
// rider. Once per turn, a weapon hit deals +1d4 psychic.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Fey Wanderer Test',
  ship_name: 'Fey Wanderer Test',
  intro: '',
  seed_id: 'fey-wanderer',
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

function buildRanger(opts: { level: number; subclass: string }) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    subclass: opts.subclass,
    level: opts.level,
    str: 16,
    dex: 14,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
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

describe('Fey Wanderer — Dreadful Strikes L3', () => {
  it('Fey Wanderer L3 hit: narrative mentions Dreadful Strikes', async () => {
    mockRandom(0.99); // auto-hit + max dmg
    const pc = buildRanger({ level: 3, subclass: 'fey_wanderer' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Dreadful Strikes: \+\d+ psychic/);
  });

  it('Hunter Ranger (control): no Dreadful Strikes', async () => {
    mockRandom(0.99);
    const pc = buildRanger({ level: 3, subclass: 'hunter' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Dreadful Strikes/);
  });

  it('Fey Wanderer L2 (sub-threshold): no Dreadful Strikes', async () => {
    mockRandom(0.99);
    const pc = buildRanger({ level: 2, subclass: 'fey_wanderer' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Dreadful Strikes/);
  });
});
