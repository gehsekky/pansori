// RE-2 — Elusive (SRD 5.2.1, Rogue L18): no attack roll can have Advantage
// against the rogue unless they have the Incapacitated condition. Implemented
// as `hasElusive` (multiclass.ts) forcing the enemy-attack advantage flag to
// false in `computeEnemyAttack`. `hasElusive` already returns false under any
// condition that imposes Incapacitated (paralyzed/stunned/unconscious/
// petrified), so those — which also grant attackers advantage — correctly keep
// the advantage.

import type { Character, Enemy } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../services/actions/types.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { hasElusive } from '../../services/multiclass.js';
import { makeChar } from '../../test-fixtures.js';
import { context as sandboxCtx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

describe('hasElusive', () => {
  it('is active at Rogue L18, not L17', () => {
    expect(hasElusive(makeChar({ character_class: 'Rogue', level: 18 }))).toBe(true);
    expect(hasElusive(makeChar({ character_class: 'Rogue', level: 17 }))).toBe(false);
  });

  it('is inactive for non-Rogues', () => {
    expect(hasElusive(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
  });

  it('counts Rogue levels in a multiclass', () => {
    expect(
      hasElusive(
        makeChar({ character_class: 'Rogue', level: 20, class_levels: { fighter: 2, rogue: 18 } })
      )
    ).toBe(true);
  });

  it('switches off under any condition that imposes Incapacitated', () => {
    for (const cond of ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified']) {
      expect(
        hasElusive(makeChar({ character_class: 'Rogue', level: 18, conditions: [cond] }))
      ).toBe(false);
    }
  });

  it('stays active under a non-incapacitating advantage condition', () => {
    for (const cond of ['prone', 'restrained', 'blinded']) {
      expect(
        hasElusive(makeChar({ character_class: 'Rogue', level: 18, conditions: [cond] }))
      ).toBe(true);
    }
  });
});

// toHit 0 so the attack total equals the raw d20; target AC 12 → a hit needs a
// 12+. Flat damage 5 so a hit is exactly −5 HP with no extra dice.
const brute = {
  id: 'brute',
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '5',
  damageType: 'slashing',
} as unknown as Enemy;

function ctxFor(target: Character): ActionContext {
  return {
    actor: enemyActor(brute),
    context: sandboxCtx,
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

// Pin the first two d20 draws (roll1 → 8, roll2 → 15) and let every later draw
// (narrative pick, etc.) resolve to 0.99 — so the only behavioral variable is
// whether the attack rolls with advantage (which consumes the second d20).
function pinRolls(): void {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  spy.mockReturnValueOnce(0.35); // d20 → 8
  spy.mockReturnValueOnce(0.7); // d20 → 15 (only consumed as a roll under advantage)
}

const attack = { type: 'enemy_attack' as const, advIdx: 0, multiattackIdx: 0 };

describe('Elusive — enemy-attack advantage suppression (integration)', () => {
  it('a prone non-Rogue is hit: the prone advantage takes the higher die (control)', () => {
    pinRolls();
    const fighter = makeChar({
      id: 'f',
      character_class: 'Fighter',
      level: 18,
      ac: 12,
      hp: 20,
      max_hp: 20,
      conditions: ['prone'],
    });
    const ctx = ctxFor(fighter);
    handleEnemyAttack(ctx, { ...attack, targetCharId: 'f' });
    expect(ctx.enemySubAttack?.outcome).toBe('done'); // advantage → max(8,15)=15 ≥ 12 → hit
    if (ctx.enemySubAttack?.outcome === 'done') expect(ctx.enemySubAttack.target.hp).toBe(15);
  });

  it('a prone Rogue L18 is missed: Elusive suppresses the advantage', () => {
    pinRolls();
    const rogue = makeChar({
      id: 'r',
      character_class: 'Rogue',
      level: 18,
      ac: 12,
      hp: 20,
      max_hp: 20,
      conditions: ['prone'],
    });
    const ctx = ctxFor(rogue);
    handleEnemyAttack(ctx, { ...attack, targetCharId: 'r' });
    expect(ctx.enemySubAttack?.outcome).toBe('done'); // no advantage → roll1 8 < 12 → miss
    if (ctx.enemySubAttack?.outcome === 'done') expect(ctx.enemySubAttack.target.hp).toBe(20);
  });
});
