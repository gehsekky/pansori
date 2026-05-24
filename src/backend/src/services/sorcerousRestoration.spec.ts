// RE-2 — Sorcerous Restoration (SRD 5.2.1, Sorcerer L5): on finishing a short
// rest, regain expended Sorcery Points up to ⌊Sorcerer level / 2⌋; once per
// long rest. Mirrors the Arcane Recovery short-rest pattern.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeState, baseSandboxSeed as seed } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Injured Sorcerer (so the short rest is allowed) with sorcery points expended.
const sorcerer = (level: number, sp: number, extra: Record<string, unknown> = {}) =>
  makeState({
    character_class: 'Sorcerer',
    level,
    cha: 16,
    hp: 3,
    max_hp: 10,
    hit_die: 6,
    hit_dice_remaining: 2,
    class_resource_uses: { sorcery_points: sp },
    ...extra,
  });

const shortRest = (state: ReturnType<typeof makeState>) =>
  takeAction({ action: { type: 'short_rest' }, history: [], state, seed, context: ctx });

describe('Sorcerous Restoration — short-rest sorcery point recovery', () => {
  it('regains ⌊level/2⌋ expended sorcery points at L10', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // L10 → regain up to 5; from 4 → 9 (cap is the L10 max of 10).
    const r = await shortRest(sorcerer(10, 4));
    const c = r.newState.characters[0];
    expect(c.class_resource_uses?.sorcery_points).toBe(9);
    expect(c.class_resource_uses?.sorcerous_restoration_used).toBe(1);
  });

  it('never exceeds the sorcery-point max (= sorcerer level)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // L10, only 2 expended → regain min(5, 2) = 2 → back to 10.
    const r = await shortRest(sorcerer(10, 8));
    expect(r.newState.characters[0].class_resource_uses?.sorcery_points).toBe(10);
  });

  it('does nothing below Sorcerer L5', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await shortRest(sorcerer(4, 1));
    const c = r.newState.characters[0];
    expect(c.class_resource_uses?.sorcery_points).toBe(1); // unchanged
    expect(c.class_resource_uses?.sorcerous_restoration_used).toBeUndefined();
  });

  it('is once per long rest — a second short rest recovers nothing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const first = await shortRest(sorcerer(10, 4));
    expect(first.newState.characters[0].class_resource_uses?.sorcery_points).toBe(9);

    const used = makeState({
      ...first.newState.characters[0],
      hp: 3,
      max_hp: 10,
      hit_dice_remaining: 2,
      class_resource_uses: { sorcery_points: 2, sorcerous_restoration_used: 1 },
    });
    const second = await shortRest(used);
    expect(second.newState.characters[0].class_resource_uses?.sorcery_points).toBe(2); // not recovered
  });

  it('resets on a long rest (flag cleared, points refilled to level)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const spent = sorcerer(10, 4, { class_resource_uses: { sorcery_points: 4, sorcerous_restoration_used: 1 } });
    const r = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state: spent,
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].class_resource_uses?.sorcerous_restoration_used).toBeUndefined();
  });
});
