// Elements Monk (2024 PHB Way of the Elements) — Elemental
// Strikes. Once per turn, on an unarmed-strike hit, spend 1 Ki
// for +1d10 fire damage. Player-choice of damage type deferred
// (currently hardcoded to fire); 10 ft push deferred.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Elements Monk Test',
  ship_name: 'Elements Monk Test',
  intro: '',
  seed_id: 'elements-monk',
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

function buildMonk(opts: { subclass: string; ki?: number }) {
  const monkLvl = 3;
  return makeChar({
    id: 'monk-1',
    character_class: 'Monk',
    subclass: opts.subclass,
    level: monkLvl,
    wis: 16,
    dex: 16,
    hp: 30,
    max_hp: 30,
    class_resource_uses: { ki_points: opts.ki ?? monkLvl },
  });
}

function buildState(monk: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: monk.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [monk],
    active_character_id: monk.id,
    initiative_order: [
      { id: monk.id, roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: monk.id,
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

describe('Elements Monk — Elemental Strikes', () => {
  it('Elements Monk unarmed hit: rider fires + Ki spent', async () => {
    mockRandom(0.99);
    const monk = buildMonk({ subclass: 'elements' });
    const state = buildState(monk);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Elemental Strikes: \+\d+ fire/);
    const after = result.newState.characters[0];
    expect(after.class_resource_uses?.ki_points).toBe(2); // started 3, spent 1
  });

  it('Open-Hand Monk (control): no Elemental Strikes', async () => {
    mockRandom(0.99);
    const monk = buildMonk({ subclass: 'open_hand' });
    const state = buildState(monk);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Elemental Strikes/);
  });

  it('No Ki: rider does NOT fire', async () => {
    mockRandom(0.99);
    const monk = buildMonk({ subclass: 'elements', ki: 0 });
    const state = buildState(monk);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Elemental Strikes/);
  });
});
