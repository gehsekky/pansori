// EE-3 — the `enemy_cast` dispatch handler. Full enemy-spellcast behavior
// (cast decision, Counterspell window) stays in attemptEnemySpellCast, which
// now routes resolution through this handler; here we check the handler
// contract: enemy-actor only, resolves the spell, and commits the damaged
// target into ctx.st.

import type { Character, Enemy, Spell } from '../../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from '../../../services/actions/actor.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { handleEnemyCast } from '../../../services/actions/enemyCast.js';
import { makeChar } from '../../../test-fixtures.js';

const lich = { id: 'lich-1', name: 'Lich', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;

// Flat-damage spell (rollDice('5') === 5), no save → deterministic full hit.
const bolt = { id: 'bolt', name: 'Shadow Bolt', damage: '5', damageType: 'necrotic' } as Spell;

function ctxFor(actor: ActionContext['actor'], target: Character): ActionContext {
  return {
    actor,
    context: { spellTable: { bolt } },
    st: { characters: [target], entities: [] },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleEnemyCast', () => {
  it('rejects a non-enemy actor', () => {
    const char = makeChar({ id: 'pc-1' });
    expect(
      handleEnemyCast(ctxFor(pcActor(char, 0), char), {
        type: 'enemy_cast',
        spellId: 'bolt',
        targetCharId: 'pc-1',
      })
    ).toMatchObject({ rejected: expect.stringContaining('enemy actor') });
  });

  it('rejects a spell with no damage', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(enemyActor(lich), char);
    expect(
      handleEnemyCast(ctx, { type: 'enemy_cast', spellId: 'nonexistent', targetCharId: 'pc-1' })
    ).toMatchObject({ rejected: expect.stringContaining('damage') });
  });

  it('rejects a missing target', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(enemyActor(lich), char);
    expect(
      handleEnemyCast(ctx, { type: 'enemy_cast', spellId: 'bolt', targetCharId: 'ghost' })
    ).toMatchObject({ rejected: expect.stringContaining('target') });
  });

  it('resolves the spell, damages + commits the target, and narrates the cast', () => {
    const char = makeChar({ id: 'pc-1', name: 'Halric', hp: 20, max_hp: 20 });
    const ctx = ctxFor(enemyActor(lich), char);
    const result = handleEnemyCast(ctx, {
      type: 'enemy_cast',
      spellId: 'bolt',
      targetCharId: 'pc-1',
    });
    expect(result).toBeUndefined(); // void → dispatcher proceeds
    expect(ctx.st.characters[0].hp).toBe(15); // 20 − 5 flat damage, committed to st
    expect(ctx.narrative).toContain('casts Shadow Bolt');
  });
});
