import type { Character, Enemy } from '../../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from '../../../services/actions/actor.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { handleGridMove } from '../../../services/actions/gridMove.js';
import { makeChar } from '../../../test-fixtures.js';

// Phase-3 actor migration (gridMove): the grid-move handler now reads/
// writes the mover through `ctx.actor` (narrowed to PC via updatePcActor)
// and rejects non-PC actors. Enemy grid movement is handled separately
// by attemptEnemyApproach, so this guard is the Phase-4 seam. PC
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
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('gridMove rejects non-PC actors (Phase-4 seam)', () => {
  it('grid_move returns { rejected } for an enemy actor', () => {
    const char = makeChar({ id: 'pc-1' });
    const result = handleGridMove(ctxWith(enemyActor(enemy), char), {
      type: 'grid_move',
      entityId: 'orc-1',
      to: { x: 1, y: 1 },
    });
    expect(result).toMatchObject({ rejected: expect.stringContaining('PC') });
  });
});
