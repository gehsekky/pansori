// RE-2 — Countercharm (SRD 5.2.1, Bard L7): when a creature within 30 ft fails
// a save against an effect applying Charmed or Frightened, the bard may use a
// Reaction to make that creature reroll with Advantage. Auto-resolved
// (player-favorable, like Indomitable/Stroke of Luck): a qualifying bard (self
// or ally) spends a reaction only when the advantaged reroll rescues the save.
// Wired in conditionSavingThrow; the bard's reaction is spent by the caller.

import type { Character, Enemy } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from './actions/types.js';
import { canCountercharm } from './multiclass.js';
import { enemyActor } from './actions/actor.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { makeChar } from '../test-fixtures.js';
import { context as sandboxCtx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

describe('canCountercharm', () => {
  it('is available to a Bard L7 with a reaction left', () => {
    expect(canCountercharm(makeChar({ character_class: 'Bard', level: 7 }))).toBe(true);
  });

  it('is unavailable below L7, with the reaction spent, or while incapacitated', () => {
    expect(canCountercharm(makeChar({ character_class: 'Bard', level: 6 }))).toBe(false);
    expect(canCountercharm(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
    expect(
      canCountercharm(
        makeChar({
          character_class: 'Bard',
          level: 7,
          turn_actions: {
            action_used: false,
            bonus_action_used: false,
            reaction_used: true,
            free_interaction_used: false,
          },
        })
      )
    ).toBe(false);
    expect(
      canCountercharm(makeChar({ character_class: 'Bard', level: 7, conditions: ['stunned'] }))
    ).toBe(false);
  });
});

// Auto-hit (toHit 100) flat-damage (1, no dice) wraith that applies Frightened
// on a WIS save. DC 15 — a WIS-10, non-proficient saver fails on a low roll.
const wraith = {
  id: 'wraith',
  name: 'Wraith',
  hp: 30,
  ac: 10,
  toHit: 100,
  damage: '1',
  damageType: 'necrotic',
  onHitEffect: { condition: 'frightened', ability: 'wis', dc: 15 },
} as unknown as Enemy;

function ctxFor(characters: Character[]): ActionContext {
  return {
    actor: enemyActor(wraith),
    context: sandboxCtx,
    st: { characters, entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

// Pin the first three d20-consuming draws: enemy attack roll, the narrative
// pick(), and the original (failing) WIS save. The Countercharm reroll then
// draws from the 0.99 default → a 20 → passes with Advantage.
function pinFailingSave() {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0);
}

const saver = (over = {}) =>
  makeChar({ id: 'pc-1', species: 'human', wis: 10, hp: 30, max_hp: 30, ...over });

describe('Countercharm — reroll a failed Charmed/Frightened save (integration)', () => {
  it('self: a Bard L7 rerolls their own failed save and spends their reaction', () => {
    pinFailingSave();
    const bard = saver({ character_class: 'Bard', level: 7 });
    const ctx = ctxFor([bard]);
    handleEnemyAttack(ctx, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    expect(ctx.enemySubAttack?.outcome).toBe('done');
    if (ctx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    expect(ctx.enemySubAttack.target.conditions).not.toContain('frightened');
    expect(ctx.enemySubAttack.target.turn_actions.reaction_used).toBe(true);
    expect(ctx.narrative).toContain('Countercharm');
  });

  it('ally: a Bard L7 protects a non-bard, spending the bard’s reaction', () => {
    pinFailingSave();
    const fighter = saver({ id: 'fighter', character_class: 'Fighter', level: 1 });
    const bard = makeChar({ id: 'bard', character_class: 'Bard', level: 7, species: 'human' });
    const ctx = ctxFor([fighter, bard]);
    handleEnemyAttack(ctx, {
      type: 'enemy_attack',
      targetCharId: 'fighter',
      advIdx: 0,
      multiattackIdx: 0,
    });
    expect(ctx.enemySubAttack?.outcome).toBe('done');
    if (ctx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    expect(ctx.enemySubAttack.target.conditions).not.toContain('frightened'); // fighter saved
    expect(ctx.st.characters.find((c) => c.id === 'bard')?.turn_actions.reaction_used).toBe(true);
    expect(ctx.narrative).toContain('Countercharm');
  });

  it('control: a Bard L6 has no Countercharm — the save sticks', () => {
    pinFailingSave();
    const bard = saver({ character_class: 'Bard', level: 6 });
    const ctx = ctxFor([bard]);
    handleEnemyAttack(ctx, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    if (ctx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    expect(ctx.enemySubAttack.target.conditions).toContain('frightened');
    expect(ctx.narrative).not.toContain('Countercharm');
  });
});
