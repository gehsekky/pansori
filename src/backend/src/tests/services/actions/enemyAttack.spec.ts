// EE-2 — the `enemy_attack` dispatch handler. The full enemy-combat
// behavior (reaction windows, multiattack, death saves) is covered by the
// runEnemyTurns suites that now route through this handler; here we check
// the handler contract: enemy-actor only, resolves a swing, and reports
// the outcome on ctx.enemySubAttack without committing the target.

import type { Character, Enemy } from '../../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from '../../../services/actions/actor.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { handleEnemyAttack } from '../../../services/actions/enemyAttack.js';
import { makeChar } from '../../../test-fixtures.js';

const orc = {
  id: 'orc-1',
  name: 'Orc',
  hp: 15,
  ac: 13,
  toHit: 5,
  damage: '1000', // flat huge damage → guaranteed lands hard, deterministic
  damageType: 'slashing',
} as unknown as Enemy;

function ctxFor(actor: ActionContext['actor'], target: Character): ActionContext {
  return {
    actor,
    context: { narratives: { enemyAttacks: ['{enemy} hits {target} for {dmg}.'] } },
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleEnemyAttack', () => {
  it('rejects a non-enemy actor', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(pcActor(char, 0), char);
    expect(
      handleEnemyAttack(ctx, {
        type: 'enemy_attack',
        targetCharId: 'pc-1',
        advIdx: 0,
        multiattackIdx: 0,
      })
    ).toMatchObject({ rejected: expect.stringContaining('enemy actor') });
  });

  it('rejects when the target PC is not found', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(enemyActor(orc), char);
    expect(
      handleEnemyAttack(ctx, {
        type: 'enemy_attack',
        targetCharId: 'ghost',
        advIdx: 0,
        multiattackIdx: 0,
      })
    ).toMatchObject({ rejected: expect.stringContaining('target') });
  });

  it('resolves a swing and reports the outcome on ctx.enemySubAttack', () => {
    const char = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    const ctx = ctxFor(enemyActor(orc), char);
    const result = handleEnemyAttack(ctx, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 2,
      multiattackIdx: 1,
    });
    expect(result).toBeUndefined(); // void → dispatcher proceeds
    expect(ctx.enemySubAttack).toBeDefined();
    expect(['done', 'killed-massive', 'paused']).toContain(ctx.enemySubAttack?.outcome);
    expect(ctx.narrative.length).toBeGreaterThan(0);
  });
});
