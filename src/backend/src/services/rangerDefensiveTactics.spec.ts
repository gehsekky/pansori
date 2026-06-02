// RE-2 — Ranger Defensive Tactics (SRD 5.2.1, Hunter L7), wired onto the
// feature-option picker: Escape the Horde (opportunity attacks vs you have
// Disadvantage) or Multiattack Defense (a creature that hits you has
// Disadvantage on its other attacks vs you this turn).

import type { Character, Enemy } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enemyActor, pcActor } from './actions/actor.js';
import { hasEscapeTheHorde, hasMultiattackDefense } from './multiclass.js';
import { makeChar, makeState } from '../test-fixtures.js';
import type { ActionContext } from './actions/types.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { generateChoices } from './gameEngine.js';
import { handleChooseHunterOption } from './actions/meta.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

const hunter = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Ranger', subclass: 'hunter', level: 7, ...over });

describe('Defensive Tactics helpers', () => {
  it('hasEscapeTheHorde gates on Hunter + L7 + the choice', () => {
    expect(hasEscapeTheHorde(hunter({ defensive_tactics: 'escape_the_horde' }))).toBe(true);
    expect(hasEscapeTheHorde(hunter({ defensive_tactics: 'multiattack_defense' }))).toBe(false);
    expect(hasEscapeTheHorde(hunter({ level: 6, defensive_tactics: 'escape_the_horde' }))).toBe(
      false
    );
    expect(
      hasEscapeTheHorde(
        makeChar({ character_class: 'Ranger', level: 7, defensive_tactics: 'escape_the_horde' })
      )
    ).toBe(false); // no subclass
  });

  it('hasMultiattackDefense gates likewise', () => {
    expect(hasMultiattackDefense(hunter({ defensive_tactics: 'multiattack_defense' }))).toBe(true);
    expect(hasMultiattackDefense(hunter({ defensive_tactics: 'escape_the_horde' }))).toBe(false);
  });
});

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

describe('choose_hunter_option — Defensive Tactics', () => {
  it('a Hunter L7 can choose Escape the Horde or Multiattack Defense', () => {
    const c1 = featCtx(hunter());
    handleChooseHunterOption(c1, {
      type: 'choose_hunter_option',
      feature: 'defensive_tactics',
      option: 'escape_the_horde',
    });
    expect(pcChar(c1).defensive_tactics).toBe('escape_the_horde');

    const c2 = featCtx(hunter());
    handleChooseHunterOption(c2, {
      type: 'choose_hunter_option',
      feature: 'defensive_tactics',
      option: 'multiattack_defense',
    });
    expect(pcChar(c2).defensive_tactics).toBe('multiattack_defense');
  });

  it('requires level 7', () => {
    const c = featCtx(hunter({ level: 6 }));
    handleChooseHunterOption(c, {
      type: 'choose_hunter_option',
      feature: 'defensive_tactics',
      option: 'escape_the_horde',
    });
    expect(pcChar(c).defensive_tactics).toBeUndefined();
  });

  it('surfaces both Defensive Tactics options to a Hunter L7 out of combat (not at L6)', () => {
    const offered = (level: number) => {
      const r = makeChar({ id: 'pc-1', character_class: 'Ranger', subclass: 'hunter', level });
      const state = makeState({}, { characters: [r], active_character_id: 'pc-1' });
      return generateChoices(state, baseSeed, ctx)
        .filter(
          (c) =>
            c.action.type === 'choose_hunter_option' && c.action.feature === 'defensive_tactics'
        )
        .map((c) => (c.action.type === 'choose_hunter_option' ? c.action.option : ''));
    };
    expect(offered(7).sort()).toEqual(['escape_the_horde', 'multiattack_defense']);
    expect(offered(6)).toEqual([]);
  });
});

// A minimal enemy-attack ctx (mirrors enemyAttack.spec) for Multiattack Defense.
const wolf = {
  id: 'wolf-1',
  name: 'Wolf',
  hp: 30,
  ac: 13,
  toHit: 5,
  damage: '4', // flat → deterministic, no damage roll
  damageType: 'slashing',
} as unknown as Enemy;
const baseSeed = { rooms: [], enemies: {}, connections: {} } as never;

function enemyCtx(target: Character): ActionContext {
  return {
    actor: enemyActor(wolf),
    context: { narratives: { enemyAttacks: ['{enemy} hits {target} for {dmg}.'] } },
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

describe('Multiattack Defense — integration (two enemy swings)', () => {
  it("the attacker's second swing rolls with Disadvantage after the first hits", () => {
    // swing1 normal: d20=19 (hit, marks). swing2 disadvantage: rolls 19 + 2 → min 2 → miss.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.05);
    const target = hunter({
      id: 'pc-1',
      hp: 20,
      max_hp: 20,
      ac: 15,
      defensive_tactics: 'multiattack_defense',
    });
    const c1 = enemyCtx(target);
    handleEnemyAttack(c1, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    const t1 = c1.enemySubAttack?.outcome === 'done' ? c1.enemySubAttack.target : target;
    expect(t1.hp).toBe(16); // first swing hit for 4
    expect(t1.multiattack_defense_marks?.['wolf-1']).toBe(1);

    const c2 = enemyCtx(t1);
    handleEnemyAttack(c2, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 1,
    });
    const t2 = c2.enemySubAttack?.outcome === 'done' ? c2.enemySubAttack.target : t1;
    expect(t2.hp).toBe(16); // second swing missed (disadvantage)
  });

  it('a non-Multiattack-Defense PC takes the second hit (control)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // every roll 19 → both hit
    const target = hunter({
      id: 'pc-1',
      hp: 20,
      max_hp: 20,
      ac: 15,
      defensive_tactics: 'escape_the_horde',
    });
    const c1 = enemyCtx(target);
    handleEnemyAttack(c1, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    const t1 = c1.enemySubAttack?.outcome === 'done' ? c1.enemySubAttack.target : target;
    const c2 = enemyCtx(t1);
    handleEnemyAttack(c2, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 1,
    });
    const t2 = c2.enemySubAttack?.outcome === 'done' ? c2.enemySubAttack.target : t1;
    expect(t2.hp).toBe(12); // both swings hit for 4
  });
});
