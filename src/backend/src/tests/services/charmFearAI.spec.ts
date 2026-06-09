// Enemy charm / fear AI.
//
// A Charmed enemy (charmed by a PC, e.g. Charm Person/Monster) can't attack its
// charmer — `selectTarget` drops the charmer from its candidate targets, so it
// turns on another party member, or stands down if the charmer is the only one
// present. A Frightened enemy (e.g. Fear) attacks with Disadvantage and can't
// advance on the source of its fear (`attemptEnemyApproach` holds it in place).

import type { CombatEntity, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attemptEnemyApproach, selectTarget } from '../../services/gameEngine.js';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

function ent(overrides: Partial<CombatEntity>): CombatEntity {
  return {
    id: 'e1',
    isEnemy: true,
    pos: { x: 5, y: 5 },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
    ...overrides,
  };
}

// ── Charmed enemy — won't target its charmer ──────────────────────────────────
describe('Charmed enemy — selectTarget excludes the charmer', () => {
  it('targets another PC instead of the (nearer) charmer', () => {
    const st = {
      current_room: 'entry_hall',
      characters: [
        makeChar({ id: 'pc-1', hp: 30, max_hp: 30 }),
        makeChar({ id: 'pc-2', hp: 30, max_hp: 30 }),
      ],
      entities: [
        ent({ id: 'e1', pos: { x: 5, y: 5 }, conditions: ['charmed'], charmer_id: 'pc-1' }),
        ent({ id: 'pc-1', isEnemy: false, pos: { x: 5, y: 6 } }), // charmer — adjacent (nearest)
        ent({ id: 'pc-2', isEnemy: false, pos: { x: 1, y: 1 } }), // farther, but the only valid target
      ],
    } as unknown as GameState;
    const { targetEnt } = selectTarget('e1', st);
    expect(targetEnt?.id).toBe('pc-2');
  });

  it('stands down when the charmer is the only candidate', () => {
    const st = {
      current_room: 'entry_hall',
      characters: [makeChar({ id: 'pc-1', hp: 30, max_hp: 30 })],
      entities: [
        ent({ id: 'e1', conditions: ['charmed'], charmer_id: 'pc-1' }),
        ent({ id: 'pc-1', isEnemy: false, pos: { x: 5, y: 6 } }),
      ],
    } as unknown as GameState;
    const { targetEnt, targetCharIdx } = selectTarget('e1', st);
    expect(targetEnt).toBeUndefined();
    expect(targetCharIdx).toBe(-1);
  });

  it('a non-charmed enemy still targets the nearest PC', () => {
    const st = {
      current_room: 'entry_hall',
      characters: [
        makeChar({ id: 'pc-1', hp: 30, max_hp: 30 }),
        makeChar({ id: 'pc-2', hp: 30, max_hp: 30 }),
      ],
      entities: [
        ent({ id: 'e1', pos: { x: 5, y: 5 } }),
        ent({ id: 'pc-1', isEnemy: false, pos: { x: 5, y: 6 } }), // nearest
        ent({ id: 'pc-2', isEnemy: false, pos: { x: 1, y: 1 } }),
      ],
    } as unknown as GameState;
    expect(selectTarget('e1', st).targetEnt?.id).toBe('pc-1');
  });
});

// ── Frightened enemy — attacks at Disadvantage ────────────────────────────────
// Flat-damage brute; resolveEnemyAttack auto-misses on a 1, auto-hits on a 20.
// Sequence [0.95, 0.0]: a Frightened (disadvantaged) attacker rolls 20 then 1
// and keeps the lower (1 → miss); a sighted attacker keeps the single 20 (hit).
const brute = {
  id: 'e1',
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '8',
  damageType: 'bludgeoning',
} as unknown as Enemy;

function attackCtx(frightened: boolean): ActionContext {
  const target = makeChar({ id: 'pc', ac: 10, hp: 40, max_hp: 40 });
  const e = ent({ id: 'e1', conditions: frightened ? ['frightened'] : [], frightened_by: 'pc' });
  return {
    actor: enemyActor(brute, e),
    context: ctx,
    st: { characters: [target], entities: [e], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}
const enemyAttack = {
  type: 'enemy_attack' as const,
  advIdx: 0,
  multiattackIdx: 0,
  targetCharId: 'pc',
};

describe('Frightened enemy — attacks at Disadvantage', () => {
  it('a Frightened attacker keeps the lower roll and misses', () => {
    mockRandom(0.95, 0.0);
    const c = attackCtx(true);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(40);
    else throw new Error('expected a resolved attack');
  });

  it('a sighted attacker keeps the single roll and hits', () => {
    mockRandom(0.95);
    const c = attackCtx(false);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(32);
    else throw new Error('expected a resolved attack');
  });
});

// ── Frightened enemy — can't advance on its fear source ───────────────────────
const ghoul = {
  id: 'e1',
  name: 'Ghoul',
  hp: 30,
  ac: 12,
  toHit: 4,
  damage: '1d6',
  speedFt: 30,
  attackReachFt: 5,
} as unknown as Enemy;

function approachState(frightened: boolean): GameState {
  return {
    current_room: 'entry_hall',
    characters: [makeChar({ id: 'pc-1', hp: 30, max_hp: 30 })],
    entities: [
      ent({
        id: 'e1',
        pos: { x: 6, y: 6 },
        conditions: frightened ? ['frightened'] : [],
        frightened_by: 'pc-1',
      }),
      ent({ id: 'pc-1', isEnemy: false, pos: { x: 1, y: 1 } }),
    ],
  } as unknown as GameState;
}

describe('Frightened enemy — keeps distance from its fear source', () => {
  it('a Frightened enemy is held in place (no approach on the source)', () => {
    const result = attemptEnemyApproach({
      enemy: ghoul,
      enemyId: 'e1',
      target: makeChar({ id: 'pc-1', hp: 30, max_hp: 30 }),
      st: approachState(true),
      seed: { rooms: [] } as unknown as Seed,
      resumeMi: 0,
      context: ctx,
      roomObstacleCells: [],
      narrative: '',
    });
    expect(result.kind).toBe('skip-turn');
    expect(result.narrative).toMatch(/frightened to advance/);
  });

  it('a non-frightened enemy advances normally', () => {
    const result = attemptEnemyApproach({
      enemy: ghoul,
      enemyId: 'e1',
      target: makeChar({ id: 'pc-1', hp: 30, max_hp: 30 }),
      st: approachState(false),
      seed: { rooms: [] } as unknown as Seed,
      resumeMi: 0,
      context: ctx,
      roomObstacleCells: [],
      narrative: '',
    });
    expect(result.kind).toBe('proceed-to-attack');
  });
});
