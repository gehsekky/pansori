// RE-1 Phase 4 — Animate Dead content. `runSummonSpell` is the cast
// branch for summon spells: it records a persistent ally on
// `state.summoned_allies` (materialized into combat by seedSummonedAllies,
// driven by runAllyTurn — both covered by their own specs).

import { describe, expect, it } from 'vitest';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { runSummonSpell } from './summon.js';

const skeletonSpell = {
  id: 'animate_dead',
  name: 'Animate Dead',
  summon: { name: 'Skeleton', ac: 14, maxHp: 13, toHit: 5, damage: '1d6+3' },
} as unknown as Spell;

const ctxWith = () =>
  ({
    char: { id: 'pc-1', name: 'Necro' },
    st: { summoned_allies: [] },
    narrative: '',
  }) as unknown as ActionContext;

describe('runSummonSpell', () => {
  it('records the summon on state.summoned_allies and reports it', () => {
    const ctx = ctxWith();
    const handled = runSummonSpell(ctx, skeletonSpell, ' (level-3 slot)');
    expect(handled).toBe(true);
    expect(ctx.st.summoned_allies).toHaveLength(1);
    expect(ctx.st.summoned_allies?.[0]).toMatchObject({
      ownerId: 'pc-1',
      name: 'Skeleton',
      ac: 14,
      maxHp: 13,
      toHit: 5,
      damage: '1d6+3',
    });
    expect(ctx.st.summoned_allies?.[0].id).toMatch(/^summon-/);
    expect(ctx.narrative).toContain('Skeleton');
  });

  it('appends rather than replacing existing summons', () => {
    const ctx = ctxWith();
    runSummonSpell(ctx, skeletonSpell, '');
    runSummonSpell(ctx, skeletonSpell, '');
    expect(ctx.st.summoned_allies).toHaveLength(2);
    expect(ctx.st.summoned_allies?.[0].id).not.toBe(ctx.st.summoned_allies?.[1].id);
  });

  it('returns false for a non-summon spell (leaves state untouched)', () => {
    const ctx = ctxWith();
    const handled = runSummonSpell(
      ctx,
      { id: 'fireball', name: 'Fireball' } as unknown as Spell,
      ''
    );
    expect(handled).toBe(false);
    expect(ctx.st.summoned_allies).toEqual([]);
  });
});
