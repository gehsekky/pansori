// SRD Haste (L3 transmutation). Buff a willing creature:
// Speed doubled, +2 AC, Advantage on Dex saves, +1 limited extra
// action (deferred in pansori MVP). Concentration drop applies the
// RAW lethargy: target is Incapacitated until the end of its next
// turn. Pansori models speed-0 lethargy via the incapacitated
// condition (gates actions; speed gating not separately modeled).

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, effectiveSpeed, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { rollConditionSave } from '../rulesEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Haste Test',
  ship_name: 'Haste Test',
  intro: '',
  seed_id: 'haste',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(
  pc: ReturnType<typeof makeChar>,
  ally?: ReturnType<typeof makeChar>
): GameState {
  const chars = ally ? [pc, ally] : [pc];
  return {
    ...makeState({ id: pc.id }, { current_room: 'entry_hall' }),
    characters: chars,
    active_character_id: pc.id,
  };
}

describe('Haste — buff effects', () => {
  it('cast on self applies hasted condition + sets concentration', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      dex: 14, // +2 mod → unarmored AC = 12; Haste bumps to 14
      ac: 12,
      spells_known: ['haste'],
      spell_slots_max: { 3: 2 },
      spell_slots_used: { 3: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'haste', slotLevel: 3 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.conditions).toContain('hasted');
    expect(after?.concentrating_on?.spellId).toBe('haste');
    // Unarmored AC (10 + DEX mod 2) + Haste +2 = 14.
    expect(after?.ac).toBe(14);
  });

  it('effectiveSpeed doubles for a hasted character', () => {
    const hastedPc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      speed: 30,
      conditions: ['hasted'],
    });
    expect(effectiveSpeed(hastedPc)).toBe(60);
    const normalPc = makeChar({
      id: 'pc-2',
      character_class: 'Wizard',
      level: 5,
      speed: 30,
    });
    expect(effectiveSpeed(normalPc)).toBe(30);
  });

  it('Dex saves gain advantage when hasted', () => {
    // Mock d20: first roll = 1, second roll = 18. With advantage,
    // take the higher (18). 18 + dex mod (1) = 19 vs DC 15 → succeed.
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 0 : 0.9; // d20 = 1, then 19
    });
    // Hasted: rollConditionSave should advantage-roll → succeed.
    const failedHasted = rollConditionSave('dex', 12, 15, false, 5, 0, ['hasted']);
    expect(failedHasted).toBe(false); // save succeeded (not failed)
  });
});

describe('Haste — concentration drop lethargy', () => {
  it('clears hasted + applies incapacitated for one round', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      ac: 14, // post-Haste AC
      conditions: ['hasted'],
      concentrating_on: { spellId: 'haste', rounds_left: 100 },
    });
    const state = buildState(pc);
    const { char, st } = breakConcentration(pc, state, ctx);
    expect(char.conditions).not.toContain('hasted');
    expect(char.conditions).toContain('incapacitated');
    expect(char.condition_durations?.incapacitated).toBe(1);
    // AC drops back from the +2 bump.
    expect(char.ac).toBeLessThan(14);
    // State-mirrored character also gets updated.
    const stateAfter = st.characters.find((c) => c.id === 'pc-1');
    expect(stateAfter?.conditions).not.toContain('hasted');
    expect(stateAfter?.conditions).toContain('incapacitated');
  });
});
