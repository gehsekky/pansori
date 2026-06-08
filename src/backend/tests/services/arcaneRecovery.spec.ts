// Arcane Recovery (Wizard L1) + Natural Recovery (Land Druid) — interactive
// slot choice. Recover expended spell slots up to ⌈level / 2⌉ combined levels,
// once per long rest (Arcane Recovery bars slots above 5th). The player chooses
// which slots via the `recover_slots` action (option-picker `plan` id); absent →
// the default lowest-first plan. Replaces the old auto-recover-on-short-rest.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  availableRecoveries,
  enumerateRecoveryPlans,
  planLabel,
} from '../../src/services/slotRecovery.js';
import { generateChoices, takeAction } from '../../src/services/gameEngine.js';
import { makeState, baseSandboxSeed as seed } from '../../src/test-fixtures.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const wizard = (
  level: number,
  slots: { max: Record<number, number>; used: Record<number, number> },
  extra: Record<string, unknown> = {}
) =>
  makeState({
    character_class: 'Wizard',
    level,
    int: 16,
    hp: 10,
    max_hp: 10,
    spell_slots_max: slots.max,
    spell_slots_used: slots.used,
    ...extra,
  });

const recover = (state: ReturnType<typeof makeState>, plan?: string) =>
  takeAction({
    action: { type: 'recover_slots', recovery: 'arcane', plan },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Arcane Recovery — interactive slot choice', () => {
  it('default plan (no pick) recovers lowest-first, up to ⌈level/2⌉ levels', async () => {
    // L4 wizard → budget 2. Used: two L1 + one L2. Lowest-first spends the
    // budget on both L1 slots (count-maximizing).
    const r = await recover(wizard(4, { max: { 1: 2, 2: 1 }, used: { 1: 2, 2: 1 } }));
    const c = r.newState.characters[0];
    expect(c.spell_slots_used?.[1]).toBe(0); // both L1 restored
    expect(c.spell_slots_used?.[2]).toBe(1); // L2 untouched (budget exhausted)
    expect(c.class_resource_uses?.arcane_recovery_used).toBe(1);
  });

  it('honors a chosen plan — highest-first recovers the bigger slot', async () => {
    const state = wizard(4, { max: { 1: 2, 2: 1 }, used: { 1: 2, 2: 1 } });
    const spec = availableRecoveries(state.characters[0])[0];
    const plans = enumerateRecoveryPlans(state.characters[0], spec);
    const highest = plans.find((p) => p.levels.includes(2))!; // the 2nd-level plan
    const r = await recover(state, highest.id);
    const c = r.newState.characters[0];
    expect(c.spell_slots_used?.[2]).toBe(0); // the L2 slot restored
    expect(c.spell_slots_used?.[1]).toBe(2); // L1s untouched (budget 2 spent on the L2)
  });

  it('never recovers a level-6+ slot — no plans, nothing recovered', async () => {
    const r = await recover(wizard(20, { max: { 6: 1 }, used: { 6: 1 } }));
    const c = r.newState.characters[0];
    expect(c.spell_slots_used?.[6]).toBe(1); // still expended (L6+ excluded)
    expect(c.class_resource_uses?.arcane_recovery_used).toBeUndefined();
    expect(r.narrative).toMatch(/no expended spell slots/i);
  });

  it('is once per long rest — a second recovery is rejected', async () => {
    const first = await recover(wizard(4, { max: { 1: 2 }, used: { 1: 2 } }));
    expect(first.newState.characters[0].class_resource_uses?.arcane_recovery_used).toBe(1);
    // Re-spend + try again with the used flag already set.
    const used = makeState({
      ...first.newState.characters[0],
      spell_slots_used: { 1: 2 },
    });
    const second = await recover(used);
    expect(second.newState.characters[0].spell_slots_used?.[1]).toBe(2); // not recovered
    expect(second.narrative).toMatch(/isn't available/i);
  });

  it('resets on a long rest (used flag cleared)', async () => {
    const spent = wizard(
      4,
      { max: { 1: 2 }, used: { 1: 1 } },
      {
        class_resource_uses: { arcane_recovery_used: 1 },
        hp: 3,
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

  it('is rejected mid-combat', async () => {
    const state = { ...wizard(4, { max: { 1: 2 }, used: { 1: 2 } }), combat_active: true };
    const r = await recover(state);
    expect(r.newState.characters[0].spell_slots_used?.[1]).toBe(2);
    expect(r.narrative).toMatch(/between encounters/i);
  });

  it('surfaces a recover_slots choice with an option picker when available', () => {
    const state = wizard(4, { max: { 1: 2, 2: 1 }, used: { 1: 2, 2: 1 } });
    const choice = generateChoices(state, seed, ctx).find((c) => c.action.type === 'recover_slots');
    expect(choice).toBeTruthy();
    expect(choice?.pickOption?.param).toBe('plan');
    // First (default) option is the lowest-first plan.
    expect(choice?.pickOption?.options[0].id).toBe('1,1');
  });

  it('offers nothing to a non-wizard / when no slots are expended', () => {
    expect(
      availableRecoveries(makeState({ character_class: 'Cleric', level: 4 }).characters[0])
    ).toEqual([]);
    const full = wizard(4, { max: { 1: 2 }, used: { 1: 0 } });
    expect(
      enumerateRecoveryPlans(full.characters[0], availableRecoveries(full.characters[0])[0])
    ).toEqual([]);
  });
});

describe('slotRecovery — plan enumeration', () => {
  it('labels a plan by its slot counts', () => {
    expect(planLabel([1, 1, 2])).toBe('2×1st, 1×2nd');
  });

  it('offers lowest-first then highest-first as distinct plans', () => {
    const st = wizard(6, { max: { 1: 3, 2: 2 }, used: { 1: 3, 2: 2 } }); // budget 3
    const plans = enumerateRecoveryPlans(
      st.characters[0],
      availableRecoveries(st.characters[0])[0]
    );
    expect(plans[0].id).toBe('1,1,1'); // lowest-first (3× L1)
    expect(plans.some((p) => p.id === '1,2')).toBe(true); // highest-first (L2 + L1)
  });
});
