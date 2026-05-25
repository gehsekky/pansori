// RE-2 — Fiend Warlock: Fiendish Resilience (L10, Resistance to a chosen
// damage type) and Hurl Through Hell (L14, post-hit CHA save → 8d10 Psychic +
// Incapacitated).

import type { Character, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { darkOnesLuckMaxUses, darkOnesLuckRemaining, tryDarkOnesLuck } from './darkOnesOwnLuck.js';
import { enemyActor, pcActor } from './actions/actor.js';
import { makeChar, makeState } from '../test-fixtures.js';
import type { ActionContext } from './actions/types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { handleChooseFiendishResilience } from './actions/meta.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const fiend = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Warlock', subclass: 'fiend', level: 10, cha: 16, ...over });

function featCtx(char: Character): ActionContext {
  return { actor: pcActor(char, 0), narrative: '' } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('Fiendish Resilience — choice', () => {
  it('a Fiend Warlock L10 chooses a resisted damage type', () => {
    const c = featCtx(fiend());
    handleChooseFiendishResilience(c, { type: 'choose_fiendish_resilience', damageType: 'fire' });
    expect(pcChar(c).fiendish_resilience).toBe('fire');
  });

  it('cannot choose Force', () => {
    const c = featCtx(fiend());
    const res = handleChooseFiendishResilience(c, { type: 'choose_fiendish_resilience', damageType: 'force' });
    expect(res).toEqual({ rejected: expect.stringMatching(/cannot be set to Force/) });
  });

  it('requires a Fiend Warlock of level 10', () => {
    const c = featCtx(fiend({ level: 9 }));
    handleChooseFiendishResilience(c, { type: 'choose_fiendish_resilience', damageType: 'fire' });
    expect(pcChar(c).fiendish_resilience).toBeUndefined();
  });
});

// Flat 8 fire damage, toHit 0, target AC 5 → always hits; isolates resistance.
const fireBrute = {
  id: 'brute',
  name: 'Imp',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '8',
  damageType: 'fire',
} as unknown as Enemy;

function attackCtx(target: Character): ActionContext {
  return {
    actor: enemyActor(fireBrute),
    context: ctx,
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

const enemyAttack = { type: 'enemy_attack' as const, advIdx: 0, multiattackIdx: 0 };

describe('Fiendish Resilience — resistance in combat', () => {
  it('halves matching damage type', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, hits AC 5
    const target = fiend({ id: 'w', ac: 5, hp: 40, max_hp: 40, fiendish_resilience: 'fire' });
    const c = attackCtx(target);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'w' });
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(36); // 40 − 4 (8 halved)
    else throw new Error('expected a resolved attack');
  });

  it('full damage without a matching resistance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const target = fiend({ id: 'w', ac: 5, hp: 40, max_hp: 40 }); // no resilience set
    const c = attackCtx(target);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'w' });
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(32); // 40 − 8
    else throw new Error('expected a resolved attack');
  });
});

const HHENEMY = `${ctx.startRoomId}#0`;
const hhSeed: Seed = {
  context_id: ctx.id,
  world_name: 'HH',
  ship_name: 'HH',
  intro: '',
  seed_id: 'hh',
  rooms: [{ id: ctx.startRoomId, name: 'S', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: HHENEMY, name: 'Bandit', hp: 100, ac: 13, damage: '1d6', toHit: 3, xp: 50, cha: 10 } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function hhCombat(over: Partial<Character> = {}): GameState {
  const c = fiend({ id: 'pc-1', level: 14, hp: 90, max_hp: 90, ...over });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [c],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: HHENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      { id: 'pc-1', isEnemy: false, pos: { x: 4, y: 5 }, hp: 90, maxHp: 90, conditions: [], condition_durations: {} },
      { id: HHENEMY, isEnemy: true, pos: { x: 5, y: 5 }, hp: 100, maxHp: 100, conditions: [], condition_durations: {} },
    ],
  } as unknown as GameState;
}

const useHH = async (state: GameState) =>
  takeAction({ action: { type: 'use_class_feature', featureId: 'hurl_through_hell' }, history: [], state, seed: hhSeed, context: ctx });

describe('Hurl Through Hell (L14)', () => {
  it('on a failed CHA save: Psychic damage + a hurl through the Lower Planes', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // enemy fails the CHA save
    const r = await useHH(hhCombat());
    expect((r.newState.entities ?? []).find((e) => e.id === HHENEMY)!.hp).toBeLessThan(100);
    expect(r.narrative).toMatch(/hurls|Hell/);
  });

  it('requires a Fiend Warlock of level 14', async () => {
    const r = await useHH(hhCombat({ level: 13 }));
    expect((r.newState.entities ?? []).find((e) => e.id === HHENEMY)!.hp).toBe(100);
    expect(r.narrative).toMatch(/requires a Fiend Warlock of level 14/);
  });
});

describe('Dark One’s Own Luck (L6)', () => {
  it('grants CHA-mod uses for a Fiend Warlock L6, else 0', () => {
    expect(darkOnesLuckMaxUses(fiend({ level: 6, cha: 16 }))).toBe(3); // +3 CHA
    expect(darkOnesLuckMaxUses(fiend({ level: 5, cha: 16 }))).toBe(0);
    expect(darkOnesLuckMaxUses(makeChar({ character_class: 'Wizard', level: 20, cha: 18 }))).toBe(0);
  });

  it('tracks remaining uses against the spent count', () => {
    expect(darkOnesLuckRemaining(fiend({ level: 6, cha: 16, class_resource_uses: { dark_ones_luck: 1 } }))).toBe(2);
    expect(darkOnesLuckRemaining(fiend({ level: 6, cha: 16, class_resource_uses: { dark_ones_luck: 3 } }))).toBe(0);
  });

  it('spends a use only when the 1d10 rescues the roll', () => {
    const char = fiend({ level: 6, cha: 16 });
    expect(tryDarkOnesLuck(char, () => true)).toEqual({ saved: true, used: true });
    expect(tryDarkOnesLuck(char, () => false)).toEqual({ saved: false, used: false });
    // No uses left → the luck die is never rolled.
    const spent = fiend({ level: 6, cha: 16, class_resource_uses: { dark_ones_luck: 3 } });
    expect(tryDarkOnesLuck(spent, () => true)).toEqual({ saved: false, used: false });
  });
});
