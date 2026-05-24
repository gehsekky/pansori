// EE-4 — the `enemy_move` dispatch handler. Path-planning + opportunity-attack
// behavior is covered by the runEnemyTurns suites that now route through this
// handler; here we check the handler contract: enemy-actor only, runs the
// approach resolver, and reports the outcome on ctx.enemyApproach.

import type { Character, CombatEntity, Enemy } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from './actor.js';
import type { ActionContext } from './types.js';
import { handleEnemyMove } from './enemyMove.js';
import { makeChar } from '../../test-fixtures.js';

const orc = { id: 'orc-1', name: 'Orc', ac: 13, attackReachFt: 5, speedFt: 30 } as unknown as Enemy;

const ent = (over: Partial<CombatEntity> & Pick<CombatEntity, 'id'>): CombatEntity => ({
  isEnemy: false,
  pos: { x: 0, y: 0 },
  hp: 15,
  maxHp: 15,
  conditions: [],
  condition_durations: {},
  ...over,
});

function ctxFor(
  actor: ActionContext['actor'],
  target: Character,
  entities: CombatEntity[]
): ActionContext {
  return {
    actor,
    context: {},
    seed: { rooms: [{ id: 'r1', obstacles: [] }] },
    st: { characters: [target], entities, current_room: 'r1' },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleEnemyMove', () => {
  it('rejects a non-enemy actor', () => {
    const char = makeChar({ id: 'pc-1' });
    expect(
      handleEnemyMove(ctxFor(pcActor(char, 0), char, []), {
        type: 'enemy_move',
        targetCharId: 'pc-1',
        resumeMi: 0,
      })
    ).toMatchObject({ rejected: expect.stringContaining('enemy actor') });
  });

  it('rejects a missing target', () => {
    const char = makeChar({ id: 'pc-1' });
    expect(
      handleEnemyMove(ctxFor(enemyActor(orc), char, []), {
        type: 'enemy_move',
        targetCharId: 'ghost',
        resumeMi: 0,
      })
    ).toMatchObject({ rejected: expect.stringContaining('target') });
  });

  it('reports proceed-to-attack (no header) when already in reach', () => {
    const char = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    // Orc at (5,5), PC adjacent at (5,6): distance 5 ft ≤ reach 5 → no move.
    const entities = [
      ent({ id: 'orc-1', isEnemy: true, side: 'enemy', pos: { x: 5, y: 5 } }),
      ent({ id: 'pc-1', side: 'pc', pos: { x: 5, y: 6 }, hp: 20, maxHp: 20 }),
    ];
    const ctx = ctxFor(enemyActor(orc), char, entities);
    handleEnemyMove(ctx, { type: 'enemy_move', targetCharId: 'pc-1', resumeMi: 0 });
    expect(ctx.enemyApproach).toEqual({ kind: 'proceed-to-attack', movementHeaderPrinted: false });
    expect(ctx.narrative).toBe(''); // no move → no narrative
  });

  it('skips the move mid-multiattack (resumeMi > 0) → proceed-to-attack', () => {
    const char = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    // Far apart, but resumeMi > 0 short-circuits the move entirely.
    const entities = [
      ent({ id: 'orc-1', isEnemy: true, side: 'enemy', pos: { x: 0, y: 0 } }),
      ent({ id: 'pc-1', side: 'pc', pos: { x: 7, y: 7 }, hp: 20, maxHp: 20 }),
    ];
    const ctx = ctxFor(enemyActor(orc), char, entities);
    handleEnemyMove(ctx, { type: 'enemy_move', targetCharId: 'pc-1', resumeMi: 2 });
    expect(ctx.enemyApproach?.kind).toBe('proceed-to-attack');
  });
});
