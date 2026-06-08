import type { Character, Enemy } from '../../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from '../../../services/actions/actor.js';
import {
  handleGrapple,
  handleShove,
  handleTryEscapeGrapple,
} from '../../../services/actions/combatTactical.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { handleLoot } from '../../../services/actions/loot.js';
import { handleSneak } from '../../../services/actions/sneak.js';
import { makeChar } from '../../../test-fixtures.js';

// Phase-3 actor migration (medium tier: combatTactical + sneak + loot):
// these PC-only handlers now read/write through `ctx.actor` (narrowed
// to PC) and reject non-PC actors — the Phase-4 enemy-action seam.
// (deathSave needs no migration; it never touches ctx.char.) PC
// behavior stays covered by the full suite; here we exercise the guard.

const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;

function ctxWith(
  actor: ReturnType<typeof pcActor> | ReturnType<typeof enemyActor>,
  char: Character
) {
  return {
    char,
    actor,
    st: { combat_active: true, characters: [char], entities: [] },
    enemy: undefined,
    enemyAlive: false,
    livingEnemiesInRoom: [],
    loot: undefined,
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('combatTactical + sneak + loot reject non-PC actors (Phase-4 seam)', () => {
  const cases: Array<[string, (ctx: ActionContext) => unknown]> = [
    ['grapple', (ctx) => handleGrapple(ctx, { type: 'grapple' })],
    ['try_escape_grapple', (ctx) => handleTryEscapeGrapple(ctx, { type: 'try_escape_grapple' })],
    ['shove', (ctx) => handleShove(ctx, { type: 'shove' })],
    ['sneak', (ctx) => handleSneak(ctx, { type: 'sneak' })],
    ['loot', (ctx) => handleLoot(ctx, { type: 'loot' })],
  ];

  it.each(cases)('%s returns { rejected } for an enemy actor', (_name, call) => {
    const char = makeChar({ id: 'pc-1' });
    expect(call(ctxWith(enemyActor(enemy), char))).toMatchObject({
      rejected: expect.stringContaining('PC'),
    });
  });
});
