import type { Character, Enemy } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from './actor.js';
import { handleAttune, handleDeAttune, handleUse } from './inventory.js';
import { handleLongRest, handleShortRest } from './rest.js';
import type { ActionContext } from './types.js';
import { makeChar } from '../../test-fixtures.js';

// Phase-3 actor migration (inventory + rest): these PC-only handlers
// now read/write through `ctx.actor` (narrowed to PC via updatePcActor)
// and reject non-PC actors — the Phase-4 enemy-action seam. `ctx.actor`
// is always a PC via the real dispatcher today, so PC behavior stays
// covered by the full suite; here we exercise the guard directly.

const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;

function ctxWith(
  actor: ReturnType<typeof pcActor> | ReturnType<typeof enemyActor>,
  char: Character
) {
  return {
    char,
    actor,
    st: { combat_active: false, characters: [char] },
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('inventory + rest handlers reject non-PC actors (Phase-4 seam)', () => {
  const cases: Array<[string, (ctx: ActionContext) => unknown]> = [
    ['attune', (ctx) => handleAttune(ctx, { type: 'attune', instanceId: 'i1' })],
    ['de_attune', (ctx) => handleDeAttune(ctx, { type: 'de_attune', instanceId: 'i1' })],
    ['use', (ctx) => handleUse(ctx, { type: 'use', itemId: 'potion' })],
    ['short_rest', (ctx) => handleShortRest(ctx, { type: 'short_rest' })],
    ['long_rest', (ctx) => handleLongRest(ctx, { type: 'long_rest' })],
  ];

  it.each(cases)('%s returns { rejected } for an enemy actor', (_name, call) => {
    const char = makeChar({ id: 'pc-1' });
    expect(call(ctxWith(enemyActor(enemy), char))).toMatchObject({
      rejected: expect.stringContaining('PC'),
    });
  });
});
