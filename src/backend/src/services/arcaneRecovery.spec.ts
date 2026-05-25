// RE-2 — Arcane Recovery (SRD 5.2.1, Wizard L1): on finishing a short rest,
// recover expended spell slots totaling ≤ ⌈Wizard level / 2⌉ combined levels,
// none of them level 6+. Once per long rest. Auto-resolved lowest-level-first
// (mirrors the Land Druid Natural Recovery loop), with the level-6+ carve-out.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeState, baseSandboxSeed as seed } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Injured (so the short rest is allowed) Wizard with spell slots expended.
const wizard = (
  level: number,
  slots: { max: Record<number, number>; used: Record<number, number> },
  extra: Record<string, unknown> = {}
) =>
  makeState({
    character_class: 'Wizard',
    level,
    int: 16,
    hp: 3,
    max_hp: 10,
    hit_die: 6,
    hit_dice_remaining: 2,
    spell_slots_max: slots.max,
    spell_slots_used: slots.used,
    ...extra,
  });

const shortRest = (state: ReturnType<typeof makeState>) =>
  takeAction({ action: { type: 'short_rest' }, history: [], state, seed, context: ctx });

describe('Arcane Recovery — short-rest slot recovery', () => {
  it('recovers up to ⌈level/2⌉ combined slot levels, lowest-first', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // L4 wizard → budget 2. Used: two L1 + one L2 expended.
    // Lowest-first spends the budget on the two L1 slots (count-maximizing).
    const r = await shortRest(wizard(4, { max: { 1: 2, 2: 1 }, used: { 1: 2, 2: 1 } }));
    const c = r.newState.characters[0];
    expect(c.spell_slots_used?.[1]).toBe(0); // both L1 restored
    expect(c.spell_slots_used?.[2]).toBe(1); // L2 untouched (budget exhausted)
    expect(c.class_resource_uses?.arcane_recovery_used).toBe(1);
  });

  it('never recovers a level-6+ slot even with budget to spare', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // L20 wizard → budget 10, but only a spent L6 slot is available.
    const r = await shortRest(wizard(20, { max: { 6: 1 }, used: { 6: 1 } }));
    const c = r.newState.characters[0];
    expect(c.spell_slots_used?.[6]).toBe(1); // still expended — L6+ excluded
    expect(c.class_resource_uses?.arcane_recovery_used).toBeUndefined(); // nothing recovered, flag unset
  });

  it('is once per long rest — a second short rest recovers nothing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const first = await shortRest(wizard(4, { max: { 1: 2 }, used: { 1: 2 } }));
    expect(first.newState.characters[0].spell_slots_used?.[1]).toBe(0);
    expect(first.newState.characters[0].class_resource_uses?.arcane_recovery_used).toBe(1);

    // Re-spend the recovered slots and rest again in a fresh room (the
    // arcane_recovery_used flag persists, so no recovery this time).
    const used = makeState({
      ...first.newState.characters[0],
      hp: 3,
      max_hp: 10,
      hit_dice_remaining: 2,
      spell_slots_used: { 1: 2 },
    });
    const second = await shortRest(used);
    expect(second.newState.characters[0].spell_slots_used?.[1]).toBe(2); // not recovered
  });

  it('resets on a long rest (flag cleared, slots already full)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const spent = wizard(
      4,
      { max: { 1: 2 }, used: { 1: 1 } },
      {
        class_resource_uses: { arcane_recovery_used: 1 },
      }
    );
    const r = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state: spent,
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].class_resource_uses?.arcane_recovery_used).toBeUndefined();
  });

  it('does nothing for a non-wizard', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const cleric = makeState({
      character_class: 'Cleric',
      level: 4,
      wis: 16,
      hp: 3,
      max_hp: 10,
      hit_die: 8,
      hit_dice_remaining: 2,
      spell_slots_max: { 1: 2 },
      spell_slots_used: { 1: 2 },
    });
    const r = await shortRest(cleric);
    const c = r.newState.characters[0];
    expect(c.spell_slots_used?.[1]).toBe(2); // untouched
    expect(c.class_resource_uses?.arcane_recovery_used).toBeUndefined();
  });
});
