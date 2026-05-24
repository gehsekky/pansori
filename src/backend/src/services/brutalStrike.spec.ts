// RE-2 — Brutal Strike (SRD 5.2.1, Barbarian L9): while Reckless, you may forgo
// the Reckless advantage on one STR melee attack; on a hit it deals +1d10
// (weapon's type) and applies a rider — Forceful Blow (push 15 ft, then close
// in up to half Speed without provoking OAs) or Hamstring Blow (−15 ft Speed
// until your next turn). Pre-committed via a `use_class_feature` rider toggle,
// consumed on the next qualifying attack.

import type { Character, Enemy, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { ActionContext } from './actions/types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { handleBarbarianFeature } from './actions/classFeature/barbarian.js';
import { pcActor } from './actions/actor.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

function featCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classFeatures: {} },
    narrative: '',
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};
const reckless = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
  reckless: true,
};

describe('handleBarbarianFeature — brutal_strike rider toggle', () => {
  it('sets the pending rider for a reckless Barbarian L9', () => {
    const char = makeChar({ character_class: 'Barbarian', level: 9, turn_actions: reckless });
    const c = featCtx(char);
    expect(handleBarbarianFeature(c, 'brutal_strike_forceful')).toBe(true);
    expect(pcChar(c).turn_actions.brutal_strike_pending).toBe('forceful');
  });

  it('requires Barbarian L9', () => {
    const char = makeChar({ character_class: 'Barbarian', level: 8, turn_actions: reckless });
    const c = featCtx(char);
    handleBarbarianFeature(c, 'brutal_strike_hamstring');
    expect(pcChar(c).turn_actions.brutal_strike_pending).toBeUndefined();
    expect(c.narrative).toMatch(/level 9/);
  });

  it('requires Reckless Attack to be active', () => {
    const char = makeChar({ character_class: 'Barbarian', level: 9 });
    const c = featCtx(char);
    handleBarbarianFeature(c, 'brutal_strike_forceful');
    expect(pcChar(c).turn_actions.brutal_strike_pending).toBeUndefined();
    expect(c.narrative).toMatch(/Reckless/);
  });
});

const enemyId = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Brutal Strike Test',
  ship_name: 'Brutal Strike Test',
  intro: '',
  seed_id: 'brutal-strike',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Ogre',
        hp: 200,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function barbState(rider: 'forceful' | 'hamstring') {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    level: 9,
    str: 18,
    hp: 60,
    max_hp: 60,
    inventory: [{ instance_id: 'gx-1', id: 'greataxe', name: 'Greataxe' }],
    equipped_weapon: 'gx-1',
    weapon_proficiencies: ['simple', 'martial'],
    turn_actions: { ...reckless, brutal_strike_pending: rider },
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [char],
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
        pos: { x: 3, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 4, y: 5 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Brutal Strike — on-hit riders (integration)', () => {
  it('Forceful Blow: +1d10 on hit, pushes the target 15 ft, and consumes the rider', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20: hits without advantage
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: barbState('forceful'),
      seed,
      context: ctx,
    });
    expect(r.narrative).toContain('Brutal Strike');
    expect(r.narrative).toContain('Forceful Blow');
    const ogre = r.newState.entities?.find((e) => e.id === enemyId);
    expect(ogre?.pos.x).toBe(7); // pushed from x=4 by 3 squares (15 ft)
    expect(r.newState.characters[0].turn_actions.brutal_strike_pending).toBeUndefined();
  });

  it('Hamstring Blow: applies the hamstrung condition on hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: barbState('hamstring'),
      seed,
      context: ctx,
    });
    expect(r.narrative).toContain('Hamstring Blow');
    const ogre = r.newState.entities?.find((e) => e.id === enemyId);
    expect(ogre?.conditions).toContain('hamstrung');
  });
});
