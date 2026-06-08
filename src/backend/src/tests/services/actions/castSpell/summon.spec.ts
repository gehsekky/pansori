// RE-1 Phase 4 — Animate Dead content. `runSummonSpell` is the cast
// branch for summon spells: it records persistent allies on
// `state.summoned_allies` (materialized into combat by seedSummonedAllies,
// driven by runAllyTurn — both covered by their own specs). Phase 4.5
// adds creature-variant selection (Skeleton / Zombie) + upcast multi-raise.

import { describe, expect, it } from 'vitest';
import type { ActionContext } from '../../../../services/actions/types.js';
import type { Spell } from '../../../../types.js';
import { runSummonSpell } from '../../../../services/actions/castSpell/summon.js';

const skeletonSpell = {
  id: 'animate_dead',
  name: 'Animate Dead',
  summon: { name: 'Skeleton', ac: 14, maxHp: 13, toHit: 5, damage: '1d6+3' },
} as unknown as Spell;

// Full Phase-4.5 shape: Skeleton base + Zombie variant + multi-raise.
const animateDead = {
  id: 'animate_dead',
  name: 'Animate Dead',
  level: 3,
  summon: {
    name: 'Skeleton',
    ac: 14,
    maxHp: 13,
    toHit: 5,
    damage: '1d6+3',
    variants: [{ name: 'Zombie', ac: 8, maxHp: 15, toHit: 3, damage: '1d8+1' }],
    countPerUpcastLevel: 2,
  },
} as unknown as Spell;

const ctxWith = () => {
  const char = { id: 'pc-1', name: 'Necro' };
  return {
    actor: { kind: 'pc', char, safeIdx: 0 },
    st: { summoned_allies: [] },
    narrative: '',
  } as unknown as ActionContext;
};

describe('runSummonSpell', () => {
  it('records the summon on state.summoned_allies and reports it', () => {
    const ctx = ctxWith();
    const handled = runSummonSpell(ctx, skeletonSpell, ' (level-3 slot)', 1);
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
    runSummonSpell(ctx, skeletonSpell, '', 1);
    runSummonSpell(ctx, skeletonSpell, '', 1);
    expect(ctx.st.summoned_allies).toHaveLength(2);
    expect(ctx.st.summoned_allies?.[0].id).not.toBe(ctx.st.summoned_allies?.[1].id);
  });

  it('returns false for a non-summon spell (leaves state untouched)', () => {
    const ctx = ctxWith();
    const handled = runSummonSpell(
      ctx,
      { id: 'fireball', name: 'Fireball' } as unknown as Spell,
      '',
      3
    );
    expect(handled).toBe(false);
    expect(ctx.st.summoned_allies).toEqual([]);
  });

  it('defaults to the base creature (Skeleton) when no variant is named', () => {
    const ctx = ctxWith();
    runSummonSpell(ctx, animateDead, '', 3);
    expect(ctx.st.summoned_allies).toHaveLength(1);
    expect(ctx.st.summoned_allies?.[0]).toMatchObject({ name: 'Skeleton', ac: 14, maxHp: 13 });
  });

  it('raises the chosen variant (Zombie) with its own stat block', () => {
    const ctx = ctxWith();
    runSummonSpell(ctx, animateDead, '', 3, 'Zombie');
    expect(ctx.st.summoned_allies).toHaveLength(1);
    expect(ctx.st.summoned_allies?.[0]).toMatchObject({
      name: 'Zombie',
      ac: 8,
      maxHp: 15,
      toHit: 3,
      damage: '1d8+1',
    });
  });

  it('falls back to the base creature for an unknown variant name', () => {
    const ctx = ctxWith();
    runSummonSpell(ctx, animateDead, '', 3, 'Lich');
    expect(ctx.st.summoned_allies?.[0].name).toBe('Skeleton');
  });

  it('multi-raises +2 per slot level above base (L4 → 3, L5 → 5)', () => {
    const ctx4 = ctxWith();
    runSummonSpell(ctx4, animateDead, '', 4, 'Zombie');
    expect(ctx4.st.summoned_allies).toHaveLength(3);
    expect(ctx4.st.summoned_allies?.every((a) => a.name === 'Zombie')).toBe(true);

    const ctx5 = ctxWith();
    runSummonSpell(ctx5, animateDead, '', 5);
    expect(ctx5.st.summoned_allies).toHaveLength(5);
    // distinct ids per raised creature
    expect(new Set(ctx5.st.summoned_allies?.map((a) => a.id)).size).toBe(5);
  });

  it('pluralizes the narrative for a multi-raise', () => {
    const ctx = ctxWith();
    runSummonSpell(ctx, animateDead, '', 5, 'Skeleton');
    expect(ctx.narrative).toContain('5 Skeletons rise');
  });

  // SRD Create Undead — raises a fixed `baseCount` (3 Ghouls), +1 per slot
  // level above 6th.
  const createUndead = {
    id: 'create_undead',
    name: 'Create Undead',
    level: 6,
    summon: {
      name: 'Ghoul',
      ac: 13,
      maxHp: 22,
      toHit: 4,
      damage: '2d6+2',
      baseCount: 3,
      countPerUpcastLevel: 1,
    },
  } as unknown as Spell;

  it('raises baseCount creatures at base level (Create Undead → 3 Ghouls)', () => {
    const ctx = ctxWith();
    runSummonSpell(ctx, createUndead, '', 6);
    expect(ctx.st.summoned_allies).toHaveLength(3);
    expect(ctx.st.summoned_allies?.every((a) => a.name === 'Ghoul')).toBe(true);
    expect(ctx.st.summoned_allies?.[0]).toMatchObject({ ac: 13, maxHp: 22, toHit: 4 });
    expect(ctx.narrative).toContain('3 Ghouls rise');
  });

  it('adds baseCount + per-upcast above base (Create Undead L8 → 5 Ghouls)', () => {
    const ctx = ctxWith();
    runSummonSpell(ctx, createUndead, '', 8);
    expect(ctx.st.summoned_allies).toHaveLength(5);
  });
});
