// Mercy Monk (2024 PHB Way of Mercy). L3 Hand of Healing (bonus
// action, 1 Ki, heal 1d6 + WIS) + Hand of Harm (once per turn,
// 1 Ki, +1d6 + WIS necrotic on unarmed strike hit).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Mercy Monk Test',
  ship_name: 'Mercy Monk Test',
  intro: '',
  seed_id: 'mercy-monk',
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

function buildMonk(opts: { subclass?: string; level?: number; ki?: number } = {}) {
  const monkLvl = opts.level ?? 3;
  return makeChar({
    id: 'monk-1',
    character_class: 'Monk',
    subclass: opts.subclass ?? 'mercy',
    level: monkLvl,
    wis: 16,
    dex: 16,
    hp: 30,
    max_hp: 30,
    class_resource_uses: { ki_points: opts.ki ?? monkLvl },
  });
}

function buildState(monk: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [monk, ally] : [monk];
  return {
    ...makeState({ id: monk.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: chars,
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

describe('Mercy Monk — Hand of Healing', () => {
  it('Self-heal: spends Ki, heals self, narrative shows heal', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const monk = buildMonk({ subclass: 'mercy' });
    const state = {
      ...buildState(monk),
      characters: [{ ...monk, hp: 10 }],
    };
    const result = await takeAction({
      action: { type: 'use_hand_of_healing' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.hp).toBeGreaterThan(10);
    expect(after.class_resource_uses?.ki_points).toBe(2); // started with 3, spent 1
    expect(result.narrative).toMatch(/Hand of Healing/);
  });

  it('Non-Mercy Monk rejected', async () => {
    const monk = buildMonk({ subclass: 'open_hand' });
    const state = buildState(monk);
    const result = await takeAction({
      action: { type: 'use_hand_of_healing' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Mercy Monk feature/);
  });

  it('No Ki: rejected', async () => {
    const monk = buildMonk({ subclass: 'mercy', ki: 0 });
    const state = buildState(monk);
    const result = await takeAction({
      action: { type: 'use_hand_of_healing' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No Ki points remaining/);
  });
});

describe('Mercy Monk — Hand of Harm (unarmed strike rider)', () => {
  it('Unarmed hit by Mercy Monk L3: Hand of Harm fires + Ki spent', async () => {
    mockRandom(0.99); // auto-hit
    const monk = buildMonk({ subclass: 'mercy', level: 3 }); // unarmed by default (no weapon equipped)
    const state = buildState(monk);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Hand of Harm:/);
    const after = result.newState.characters[0];
    expect(after.class_resource_uses?.ki_points).toBe(2); // started 3, spent 1
  });

  it('Open-Hand Monk (control): no Hand of Harm rider', async () => {
    mockRandom(0.99);
    const monk = buildMonk({ subclass: 'open_hand', level: 3 });
    const state = buildState(monk);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Hand of Harm/);
  });
});
