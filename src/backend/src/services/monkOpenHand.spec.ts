// RE-2 — Monk: Empowered Strikes (base L6, unarmed strikes can deal Force)
// and Warrior of the Open Hand's Wholeness of Body (L6, bonus-action self-heal,
// WIS-mod uses per long rest).

import type { Character, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { ActionContext } from './actions/types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { handleMonkFeature } from './actions/classFeature/monk.js';
import { pcActor } from './actions/actor.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

function featCtx(char: Character): ActionContext {
  return { actor: pcActor(char, 0), context: { classFeatures: {} }, narrative: '' } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};
const freshTurn = () => ({
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
});

describe('Wholeness of Body (Open Hand L6)', () => {
  it('heals as a bonus action and consumes a use', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 1d8 → 8
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'open_hand',
      level: 6,
      wis: 16, // +3 mod → 3 uses
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
    });
    const c = featCtx(char);
    expect(handleMonkFeature(c, 'wholeness_of_body')).toBe(true);
    expect(pcChar(c).hp).toBeGreaterThan(3);
    expect(pcChar(c).class_resource_uses?.wholeness_of_body_used).toBe(1);
    expect(pcChar(c).turn_actions.bonus_action_used).toBe(true);
  });

  it('is exhausted after WIS-mod uses', () => {
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'open_hand',
      level: 6,
      wis: 16, // 3 uses
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
      class_resource_uses: { wholeness_of_body_used: 3 },
    });
    const c = featCtx(char);
    handleMonkFeature(c, 'wholeness_of_body');
    expect(c.narrative).toMatch(/exhausted/);
    expect(pcChar(c).hp).toBe(3); // no heal
  });

  it('requires Open Hand (a different subclass cannot use it)', () => {
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'shadow',
      level: 6,
      wis: 16,
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
    });
    const c = featCtx(char);
    handleMonkFeature(c, 'wholeness_of_body');
    expect(c.narrative).toMatch(/Open Hand/);
  });

  it('requires Monk L6', () => {
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'open_hand',
      level: 5,
      wis: 16,
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
    });
    const c = featCtx(char);
    handleMonkFeature(c, 'wholeness_of_body');
    expect(c.narrative).toMatch(/level 6/);
    expect(pcChar(c).hp).toBe(3);
  });
});

// Unarmed Monk vs a high-HP dummy; an auto-hit roll, read the damage type.
const ENEMY = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Empowered Test',
  ship_name: 'Empowered Test',
  intro: '',
  seed_id: 'empowered',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: ENEMY, name: 'Dummy', hp: 200, ac: 5, damage: '1d6', toHit: 3, xp: 50 } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function monkState(level: number): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Monk',
    subclass: 'open_hand',
    level,
    str: 16,
    dex: 16,
    // no equipped_weapon → unarmed strike
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      { id: 'pc-1', isEnemy: false, pos: { x: 4, y: 5 }, hp: 30, maxHp: 30, conditions: [], condition_durations: {} },
      { id: ENEMY, isEnemy: true, pos: { x: 5, y: 5 }, hp: 200, maxHp: 200, conditions: [], condition_durations: {} },
    ],
  } as unknown as GameState;
}

describe('Empowered Strikes (Monk L6) — unarmed Force damage', () => {
  it('a L6 Monk unarmed strike deals Force', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, hits
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: monkState(6),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.damageType).toBe('force');
  });

  it('a L5 Monk unarmed strike is not Force', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: monkState(5),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.damageType).not.toBe('force');
  });
});
