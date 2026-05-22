// Eldritch Knight Fighter L7 — War Magic. After casting a
// cantrip with your action, you can make one weapon attack as
// a bonus action.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'EK War Magic Test',
  ship_name: 'EK War Magic Test',
  intro: '',
  seed_id: 'ek-war-magic',
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

function buildEk(opts: { level: number; subclass: string }) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    subclass: opts.subclass,
    level: opts.level,
    str: 16,
    int: 14,
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

describe('Eldritch Knight — War Magic L7', () => {
  it('choice surfaces when ek_war_magic_pending is set + EK + bonus action available', () => {
    const pc = buildEk({ level: 7, subclass: 'eldritch_knight' });
    pc.turn_actions = {
      ...pc.turn_actions,
      action_used: true,
      ek_war_magic_pending: true,
    };
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const wm = choices.find((c) => c.action.type === 'ek_war_magic_attack');
    expect(wm).toBeDefined();
    expect(wm?.label).toMatch(/War Magic/);
  });

  it('handler executes the bonus attack and consumes the flag', async () => {
    mockRandom(0.99);
    const pc = buildEk({ level: 7, subclass: 'eldritch_knight' });
    pc.turn_actions = {
      ...pc.turn_actions,
      action_used: true,
      ek_war_magic_pending: true,
    };
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'ek_war_magic_attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/War Magic bonus attack/);
  });

  it('non-EK Fighter is rejected', async () => {
    const pc = buildEk({ level: 7, subclass: 'champion' });
    pc.turn_actions = {
      ...pc.turn_actions,
      action_used: true,
      ek_war_magic_pending: true,
    };
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'ek_war_magic_attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Eldritch Knight Fighter feature/);
  });

  it('L6 EK rejected (threshold L7)', async () => {
    const pc = buildEk({ level: 6, subclass: 'eldritch_knight' });
    pc.turn_actions = {
      ...pc.turn_actions,
      action_used: true,
      ek_war_magic_pending: true,
    };
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'ek_war_magic_attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/level 7/);
  });

  it('flag missing → rejected', async () => {
    const pc = buildEk({ level: 7, subclass: 'eldritch_knight' });
    pc.turn_actions = { ...pc.turn_actions, action_used: true };
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'ek_war_magic_attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/requires you to have just cast a cantrip/);
  });
});
