// SRD movement-conditional charge rider — when an enemy moves `afterFt`+ feet
// toward its target this turn (charged_ft stamped during the approach) and then
// hits, the first connecting hit deals extra `bonusDamage` and (when `prone`)
// knocks the target Prone (2024 SRD: automatic, no save). Consumed on the first
// hit so a Multiattack adds it once.

import type { CombatEntity, Enemy } from '../../types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../services/actions/types.js';
import type { Character } from '../../types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { makeChar } from '../../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

// Auto-hit (toHit 100), flat-10 base damage so the rider is the only dice rolled.
const charger = (chargeRider: Enemy['chargeRider']): Enemy =>
  ({
    id: 'boar',
    name: 'Boar',
    hp: 50,
    ac: 10,
    toHit: 100,
    damage: '10',
    damageType: 'piercing',
    chargeRider,
  }) as unknown as Enemy;

const ent = (over: Partial<CombatEntity>): CombatEntity => ({
  id: 'boar',
  isEnemy: true,
  pos: { x: 5, y: 5 },
  hp: 50,
  maxHp: 50,
  conditions: [],
  condition_durations: {},
  ...over,
});

function ctxFor(enemy: Enemy, pc: Character, chargedFt: number): ActionContext {
  return {
    actor: enemyActor(enemy, ent({ charged_ft: chargedFt })),
    context: ctx,
    st: {
      characters: [pc],
      entities: [
        ent({ charged_ft: chargedFt }),
        { id: 'pc-1', isEnemy: false, pos: { x: 5, y: 6 }, hp: pc.hp, maxHp: pc.max_hp },
      ] as unknown as CombatEntity[],
      round: 1,
    },
    narrative: '',
  } as unknown as ActionContext;
}

const attack = {
  type: 'enemy_attack' as const,
  targetCharId: 'pc-1',
  advIdx: 0,
  multiattackIdx: 0,
};
const pc = () => makeChar({ id: 'pc-1', character_class: 'Fighter', level: 3, hp: 40, max_hp: 40 });

const done = (c: ActionContext) => {
  if (c.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
  return c.enemySubAttack;
};

describe('charge rider', () => {
  // Pin RNG: d20 → 11 (auto-hits via +100, not a crit); 2d6 rider → 4+4 = 8.
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));

  it('adds the bonus damage + Prone when charged, then consumes the charge', () => {
    const c = ctxFor(charger({ afterFt: 20, bonusDamage: '2d6', prone: true }), pc(), 20);
    handleEnemyAttack(c, attack);
    const r = done(c);
    expect(r.target.hp).toBe(40 - (10 + 8)); // base 10 + rider 8
    expect(r.target.conditions).toContain('prone');
    // charged_ft zeroed so a second swing this turn won't re-add the rider.
    expect(r.st.entities?.find((e) => e.id === 'boar' && e.isEnemy)?.charged_ft).toBe(0);
  });

  it('does NOT fire when the enemy moved less than the threshold', () => {
    const c = ctxFor(charger({ afterFt: 20, bonusDamage: '2d6', prone: true }), pc(), 10);
    handleEnemyAttack(c, attack);
    const r = done(c);
    expect(r.target.hp).toBe(30); // base 10 only
    expect(r.target.conditions).not.toContain('prone');
  });

  it('a Prone-only rider (no bonus damage) still knocks Prone on a charge', () => {
    const c = ctxFor(charger({ afterFt: 20, prone: true }), pc(), 20);
    handleEnemyAttack(c, attack);
    const r = done(c);
    expect(r.target.hp).toBe(30); // base only — no extra damage
    expect(r.target.conditions).toContain('prone');
  });
});
