// Monster-ability infrastructure (computeEnemyAttack trio): Pack Tactics +
// Bloodied Frenzy advantage, and bonus on-hit damage riders.
//
// resolveEnemyAttack rolls roll===1 = auto-miss, roll===20 = auto-hit. The
// sequence [0.0, 0.95] → with Advantage the attacker rolls 1 then 20 and keeps
// the higher (20 → hit); without it, the single 1 auto-misses. So an ability
// that grants Advantage flips a guaranteed miss into a guaranteed hit.

import type { CombatEntity, Enemy } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

const enemyAttack = {
  type: 'enemy_attack' as const,
  advIdx: 0,
  multiattackIdx: 0,
  targetCharId: 'pc',
};

function buildCtx(
  enemy: Partial<Enemy>,
  entities: CombatEntity[],
  targetConditions: string[] = []
): {
  c: ActionContext;
  attacker: Enemy;
} {
  const attacker = {
    id: 'e1',
    name: 'Brute',
    hp: 30,
    ac: 13,
    toHit: 0,
    damage: '8',
    damageType: 'bludgeoning',
    ...enemy,
  } as unknown as Enemy;
  const target = makeChar({ id: 'pc', ac: 10, hp: 40, max_hp: 40, conditions: targetConditions });
  const c = {
    actor: enemyActor(
      attacker,
      entities.find((e) => e.id === 'e1')
    ),
    context: ctx,
    st: { characters: [target], entities, round: 1 },
    narrative: '',
  } as unknown as ActionContext;
  return { c, attacker };
}

function ent(o: Partial<CombatEntity>): CombatEntity {
  return {
    id: 'x',
    isEnemy: true,
    pos: { x: 0, y: 0 },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
    ...o,
  };
}

const pcEnt = ent({ id: 'pc', isEnemy: false, pos: { x: 5, y: 5 }, hp: 40, maxHp: 40 });
const attackerEnt = ent({ id: 'e1', pos: { x: 5, y: 6 } }); // adjacent to PC

describe('Pack Tactics — advantage when an ally is adjacent to the target', () => {
  it('hits (advantage) with an ally within 5 ft of the target', () => {
    mockRandom(0.0, 0.95);
    const ally = ent({ id: 'e2', pos: { x: 5, y: 4 } }); // adjacent to PC
    const { c } = buildCtx({ packTactics: true }, [pcEnt, attackerEnt, ally]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done')
      expect(c.enemySubAttack.target.hp).toBe(32); // 40−8
    else throw new Error('expected a resolved attack');
  });

  it('misses (no advantage) with no ally near the target', () => {
    mockRandom(0.0, 0.95);
    const { c } = buildCtx({ packTactics: true }, [pcEnt, attackerEnt]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(40);
    else throw new Error('expected a resolved attack');
  });
});

describe('Bloodied Frenzy — advantage while the attacker is ≤ half HP', () => {
  it('hits (advantage) while bloodied', () => {
    mockRandom(0.0, 0.95);
    const bloodied = ent({ id: 'e1', pos: { x: 5, y: 6 }, hp: 10, maxHp: 67 });
    const { c } = buildCtx({ bloodiedFrenzy: true }, [pcEnt, bloodied]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(32);
    else throw new Error('expected a resolved attack');
  });

  it('misses (no advantage) at full HP', () => {
    mockRandom(0.0, 0.95);
    const full = ent({ id: 'e1', pos: { x: 5, y: 6 }, hp: 67, maxHp: 67 });
    const { c } = buildCtx({ bloodiedFrenzy: true }, [pcEnt, full]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(40);
    else throw new Error('expected a resolved attack');
  });
});

describe('Bonus on-hit damage rider', () => {
  it('adds the bonus damage on a hit (8 primary + 4 necrotic)', () => {
    mockRandom(0.99); // single roll 20 → auto-hit; flat damage = no extra rolls
    const { c } = buildCtx({ bonusDamage: '4', bonusDamageType: 'necrotic' }, [pcEnt, attackerEnt]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done')
      expect(c.enemySubAttack.target.hp).toBe(28); // 40−8−4
    else throw new Error('expected a resolved attack');
  });

  it('halves the bonus when the target resists the bonus type', () => {
    mockRandom(0.99);
    const target = makeChar({
      id: 'pc',
      ac: 10,
      hp: 40,
      max_hp: 40,
      spell_resistances: ['necrotic'],
    });
    const c = {
      actor: enemyActor(
        {
          id: 'e1',
          name: 'Brute',
          hp: 30,
          ac: 13,
          toHit: 0,
          damage: '8',
          bonusDamage: '4',
          bonusDamageType: 'necrotic',
        } as unknown as Enemy,
        attackerEnt
      ),
      context: ctx,
      st: { characters: [target], entities: [pcEnt, attackerEnt], round: 1 },
      narrative: '',
    } as unknown as ActionContext;
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done')
      expect(c.enemySubAttack.target.hp).toBe(30); // 40−8−ceil(4/2)
    else throw new Error('expected a resolved attack');
  });
});
