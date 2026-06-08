import type { Character, Enemy } from '../../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from '../../../services/actions/actor.js';
import { handleEndTurn, handlePass } from '../../../services/actions/utility.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { handleDisarmTrap } from '../../../services/actions/disarmTrap.js';
import { handleExamine } from '../../../services/actions/examineDefault.js';
import { makeChar } from '../../../test-fixtures.js';

// Phase-3 actor migration (final stragglers: disarm_trap, pass,
// end_turn, examine). These PC-only handlers now read/write
// through `ctx.actor` (narrowed to PC) and reject non-PC actors — the
// Phase-4 enemy-action seam. PC behavior stays covered by the full
// suite; here we exercise the guard.

const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;

function ctxWith(
  actor: ReturnType<typeof pcActor> | ReturnType<typeof enemyActor>,
  char: Character
) {
  return {
    char,
    actor,
    st: { combat_active: false, characters: [char] },
    seed: { rooms: [] },
    roomId: 'room-1',
    enemyAlive: false,
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('Phase-3 straggler handlers reject non-PC actors (Phase-4 seam)', () => {
  const cases: Array<[string, (ctx: ActionContext) => unknown]> = [
    ['disarm_trap', (ctx) => handleDisarmTrap(ctx, { type: 'disarm_trap' })],
    ['pass', (ctx) => handlePass(ctx, { type: 'pass' })],
    ['end_turn', (ctx) => handleEndTurn(ctx, { type: 'end_turn' })],
    ['examine', (ctx) => handleExamine(ctx, { type: 'examine' })],
  ];

  it.each(cases)('%s returns { rejected } for an enemy actor', (_name, call) => {
    const char = makeChar({ id: 'pc-1' });
    expect(call(ctxWith(enemyActor(enemy), char))).toMatchObject({
      rejected: expect.stringContaining('PC'),
    });
  });
});
