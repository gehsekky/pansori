// Regression for the death-save-on-enemy-turn bug surfaced in a Vale of
// Shadows log: when the Crypt Lord's multiattack hit a downed PC, the engine
// rolled a d20 death save ON THE ENEMY'S TURN ("Death Save — roll 19 …") in
// addition to the 2-failure auto-crit penalty. RAW: a downed creature rolls
// death saves only at the start of its OWN turn; an enemy hitting it within
// 5 ft is just an auto-crit = 2 failures, no roll.

import { describe, expect, it, vi } from 'vitest';
import type { Enemy } from '../../types.js';
import { makeChar } from '../../test-fixtures.js';
import { processDeathSave } from '../../services/gameEngine.js';
import { context as valeCtx } from '../fixtures/testContext.js';

const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;

const downed = (failures: number) =>
  makeChar({
    id: 'pc-1',
    name: 'Halric',
    hp: 0,
    max_hp: 20,
    conditions: ['unconscious'],
    death_saves: { successes: 0, failures },
  });

describe('processDeathSave — enemy attack on a downed PC (enemyAttackContext)', () => {
  it('applies the 2-failure penalty WITHOUT rolling a death save', () => {
    const r = processDeathSave(downed(0), enemy, valeCtx, 'Vale', true, 3);
    expect(r.newChar.death_saves).toEqual({ successes: 0, failures: 2 });
    expect(r.narrative).toContain('2 death save failures');
    // The bug: a spurious "Death Save — <roll>" appeared on the enemy's turn.
    expect(r.narrative).not.toMatch(/Death Save — /);
    expect(r.died).toBe(false);
  });

  it('reaching 3 failures from the attack kills the PC', () => {
    const r = processDeathSave(downed(1), enemy, valeCtx, 'Vale', true, 3);
    expect(r.newChar.death_saves.failures).toBe(3);
    expect(r.died).toBe(true);
    expect(r.newChar.dead).toBe(true);
  });

  it('does not also roll a save, so successes are untouched by an enemy hit', () => {
    const r = processDeathSave(
      makeChar({
        id: 'pc-1',
        hp: 0,
        conditions: ['unconscious'],
        death_saves: { successes: 2, failures: 0 },
      }),
      enemy,
      valeCtx,
      'Vale',
      true,
      3
    );
    expect(r.newChar.death_saves.successes).toBe(2); // unchanged — no roll happened
    expect(r.newChar.death_saves.failures).toBe(2);
  });

  it('still rolls normally on the PC own-turn path (enemyAttackContext = false)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11 → a rolled success
    const r = processDeathSave(downed(0), null, valeCtx, 'Vale', false, 3);
    expect(r.narrative).toMatch(/Death Save — /); // the PC rolls on their own turn
    vi.restoreAllMocks();
  });
});
