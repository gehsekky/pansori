// RE-2 — Deflect Attacks (SRD 5.2.1, Monk L3): when an attack that deals
// Bludgeoning/Piercing/Slashing damage hits you, a Reaction reduces the damage
// by 1d10 + DEX + Monk level. Auto-resolved in computeEnemyAttack when the monk
// has a Reaction. (The optional Focus-Point redirect is deferred.)

import type { Character, Enemy } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from './actions/types.js';
import { enemyActor } from './actions/actor.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { makeChar } from '../test-fixtures.js';
import { context as sandboxCtx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

// Auto-hit (toHit 100) flat-20 damage enemy. damageType varies per test.
const brute = (damageType: string) =>
  ({
    id: 'brute',
    name: 'Brute',
    hp: 50,
    ac: 10,
    toHit: 100,
    damage: '20',
    damageType,
  }) as unknown as Enemy;

function ctxFor(monk: Character, enemy: Enemy): ActionContext {
  return {
    actor: enemyActor(enemy),
    context: sandboxCtx,
    st: { characters: [monk], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

const monk = (level: number, over = {}) =>
  makeChar({ id: 'pc-1', character_class: 'Monk', level, dex: 16, hp: 40, max_hp: 40, ...over });

const attack = {
  type: 'enemy_attack' as const,
  targetCharId: 'pc-1',
  advIdx: 0,
  multiattackIdx: 0,
};
const targetHp = (ctx: ActionContext) => {
  if (ctx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
  return ctx.enemySubAttack.target.hp;
};

describe('Deflect Attacks — reduce a B/P/S hit', () => {
  it('a Monk L3 reduces slashing damage by 1d10 + DEX + level and spends a reaction', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d10 → 6; reduction = 6 + 3 + 3 = 12
    const ctx = ctxFor(monk(3), brute('slashing'));
    handleEnemyAttack(ctx, attack);
    expect(targetHp(ctx)).toBe(32); // 40 − (20 − 12)
    if (ctx.enemySubAttack?.outcome === 'done') {
      expect(ctx.enemySubAttack.target.turn_actions.reaction_used).toBe(true);
    }
    expect(ctx.narrative).toContain('Deflect Attacks');
  });

  it('does not apply below L3 (control)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ctx = ctxFor(monk(2), brute('slashing'));
    handleEnemyAttack(ctx, attack);
    expect(targetHp(ctx)).toBe(20); // full 20
  });

  it('does not apply to non-B/P/S damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ctx = ctxFor(monk(3), brute('fire'));
    handleEnemyAttack(ctx, attack);
    expect(targetHp(ctx)).toBe(20); // fire isn't deflected
  });

  it('does not apply when the reaction is already spent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ctx = ctxFor(
      monk(3, {
        turn_actions: {
          action_used: false,
          bonus_action_used: false,
          reaction_used: true,
          free_interaction_used: false,
        },
      }),
      brute('slashing')
    );
    handleEnemyAttack(ctx, attack);
    expect(targetHp(ctx)).toBe(20); // no reaction left
  });
});
