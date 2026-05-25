// RE-2 — Fiend Warlock: Fiendish Resilience (L10) — Resistance to a chosen
// damage type (not Force), re-chooseable on a rest.

import type { Character, Enemy } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enemyActor, pcActor } from './actions/actor.js';
import type { ActionContext } from './actions/types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { handleChooseFiendishResilience } from './actions/meta.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { makeChar } from '../test-fixtures.js';

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
