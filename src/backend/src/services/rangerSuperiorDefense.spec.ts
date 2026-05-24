// RE-2 — Superior Hunter's Defense (SRD 5.2.1, Hunter L15): when you take
// damage, a Reaction grants Resistance to that damage and any other damage of
// the same type until the end of the turn. Auto-resolved (player-favorable,
// like Deflect Attacks): the reaction is spent on the first hit of a type this
// round, then that type is halved free for the rest of the round.

import type { Character, Enemy } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from './actions/types.js';
import { enemyActor } from './actions/actor.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { hasSuperiorHuntersDefense } from './multiclass.js';
import { makeChar } from '../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

describe('hasSuperiorHuntersDefense', () => {
  it('gates on Hunter subclass + L15', () => {
    expect(hasSuperiorHuntersDefense(makeChar({ character_class: 'Ranger', subclass: 'hunter', level: 15 }))).toBe(true);
    expect(hasSuperiorHuntersDefense(makeChar({ character_class: 'Ranger', subclass: 'hunter', level: 14 }))).toBe(false);
    expect(hasSuperiorHuntersDefense(makeChar({ character_class: 'Ranger', level: 15 }))).toBe(false); // no subclass
  });
});

const wolf = {
  id: 'wolf-1',
  name: 'Wolf',
  hp: 30,
  ac: 13,
  toHit: 5,
  damage: '8', // flat → deterministic, no damage roll
  damageType: 'slashing',
} as unknown as Enemy;

function enemyCtx(target: Character): ActionContext {
  return {
    actor: enemyActor(wolf),
    context: { narratives: { enemyAttacks: ['{enemy} hits {target} for {dmg}.'] } },
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}
const swing = (ctx: ActionContext, mi: number) =>
  handleEnemyAttack(ctx, { type: 'enemy_attack', targetCharId: 'pc-1', advIdx: 0, multiattackIdx: mi });
const after = (ctx: ActionContext, fallback: Character) =>
  ctx.enemySubAttack?.outcome === 'done' ? ctx.enemySubAttack.target : fallback;

const hunter15 = (over: Partial<Character> = {}) =>
  makeChar({ id: 'pc-1', character_class: 'Ranger', subclass: 'hunter', level: 15, hp: 30, max_hp: 30, ac: 13, ...over });

describe('Superior Hunter’s Defense — integration', () => {
  it('halves the first hit and spends the reaction, then halves the same type free', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // every d20 = 19 → all hits
    const target = hunter15();
    const c1 = enemyCtx(target);
    swing(c1, 0);
    const t1 = after(c1, target);
    expect(t1.hp).toBe(26); // 8 slashing halved to 4
    expect(t1.turn_actions.reaction_used).toBe(true);
    expect(t1.superior_hunters_def).toEqual({ type: 'slashing', round: 1 });

    // Second slashing hit this round: halved free (reaction already spent).
    const c2 = enemyCtx(t1);
    swing(c2, 1);
    expect(after(c2, t1).hp).toBe(22); // another 4
  });

  it('a Hunter L14 takes full damage (control)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const target = hunter15({ level: 14 });
    const c1 = enemyCtx(target);
    swing(c1, 0);
    expect(after(c1, target).hp).toBe(22); // full 8
  });
});
