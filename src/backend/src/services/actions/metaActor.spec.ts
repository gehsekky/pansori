import type { Character, Enemy } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from './actor.js';
import {
  handleApplyAsi,
  handleLevelUpClass,
  handlePrepareSpells,
  handleSelectSubclass,
  handleTakeFeat,
} from './meta.js';
import type { ActionContext } from './types.js';
import { handleCompleteQuest } from './quest.js';
import { makeChar } from '../../test-fixtures.js';

// Phase-3 actor migration (meta + quest): these PC-only handlers now
// read/write through `ctx.actor` (narrowed to PC) and reject non-PC
// actors — the Phase-4 enemy-action seam. `ctx.actor` is always a PC
// via the real dispatcher today, so the guard is exercised directly.

const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;

function ctxWith(
  actor: ReturnType<typeof pcActor> | ReturnType<typeof enemyActor>,
  char: Character
) {
  return {
    char,
    actor,
    st: { combat_active: false, characters: [char] },
    context: {},
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('meta + quest handlers reject non-PC actors (Phase-4 seam)', () => {
  const cases: Array<[string, (ctx: ActionContext) => unknown]> = [
    ['apply_asi', (ctx) => handleApplyAsi(ctx, { type: 'apply_asi', stat: 'con' })],
    [
      'select_subclass',
      (ctx) => handleSelectSubclass(ctx, { type: 'select_subclass', subclass: 'champion' }),
    ],
    ['prepare_spells', (ctx) => handlePrepareSpells(ctx, { type: 'prepare_spells', spellIds: [] })],
    ['take_feat', (ctx) => handleTakeFeat(ctx, { type: 'take_feat', featId: 'alert' })],
    [
      'level_up_class',
      (ctx) => handleLevelUpClass(ctx, { type: 'level_up_class', className: 'fighter' }),
    ],
    [
      'complete_quest',
      (ctx) => handleCompleteQuest(ctx, { type: 'complete_quest', questId: 'q1' }),
    ],
  ];

  it.each(cases)('%s returns { rejected } for an enemy actor', (_name, call) => {
    const char = makeChar({ id: 'pc-1' });
    expect(call(ctxWith(enemyActor(enemy), char))).toMatchObject({
      rejected: expect.stringContaining('PC'),
    });
  });
});

describe('meta PC path writes through ctx.actor.char', () => {
  it('select_subclass writes through the actor', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxWith(pcActor(char, 0), char);
    handleSelectSubclass(ctx, { type: 'select_subclass', subclass: 'champion' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.subclass).toBe('champion');
  });
});
