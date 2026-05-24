import type { Character, Enemy } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from './actor.js';
import {
  handleDash,
  handleDisengage,
  handleHelp,
  handleReady,
  handleSpendInspiration,
  handleStandUp,
} from './combatUtility.js';
import type { ActionContext } from './types.js';
import { makeChar } from '../../test-fixtures.js';

// Phase-3 actor migration: these handlers now read/write through
// `ctx.actor` (narrowed to PC) and reject non-PC actors — the slot
// where enemy-action semantics will live once enemies route through
// the dispatcher (Phase 4). `ctx.actor` is always a PC today, so the
// guard is unreachable via the real dispatcher; these tests exercise
// it directly to lock the seam.

const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;

function ctxWith(
  actor: ReturnType<typeof pcActor> | ReturnType<typeof enemyActor>,
  char: Character
) {
  return {
    char,
    actor,
    st: { combat_active: true, characters: [char], movement_used: {}, entities: [] },
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('combatUtility handlers reject non-PC actors (Phase-4 seam)', () => {
  const cases: Array<[string, (ctx: ActionContext) => unknown]> = [
    ['spend_inspiration', (ctx) => handleSpendInspiration(ctx, { type: 'spend_inspiration' })],
    ['stand_up', (ctx) => handleStandUp(ctx, { type: 'stand_up' })],
    ['disengage', (ctx) => handleDisengage(ctx, { type: 'disengage' })],
    ['dash', (ctx) => handleDash(ctx, { type: 'dash' })],
    ['help', (ctx) => handleHelp(ctx, { type: 'help', targetId: 'pc-1' })],
    [
      'ready',
      (ctx) =>
        handleReady(ctx, {
          type: 'ready',
          trigger: 'enemy enters reach',
          action: { type: 'dash' },
        }),
    ],
  ];

  it.each(cases)('%s returns { rejected } for an enemy actor', (_name, call) => {
    const char = makeChar({ id: 'pc-1' });
    const result = call(ctxWith(enemyActor(enemy), char));
    expect(result).toMatchObject({ rejected: expect.stringContaining('PC') });
  });
});

describe('combatUtility PC path writes through ctx.actor.char', () => {
  it('disengage flags the active PC via updatePcActor', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxWith(pcActor(char, 0), char);
    handleDisengage(ctx, { type: 'disengage' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.turn_actions.disengaged).toBe(true);
    expect(ctx.usedInitiative).toBe(true);
  });

  it('spend_inspiration queues inspiration on the actor when held', () => {
    const char = makeChar({ id: 'pc-1', inspiration: true });
    const ctx = ctxWith(pcActor(char, 0), char);
    handleSpendInspiration(ctx, { type: 'spend_inspiration' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.turn_actions.inspiration_pending).toBe(true);
  });
});
