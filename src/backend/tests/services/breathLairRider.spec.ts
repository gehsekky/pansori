// Breath weapons and lair actions can carry a rider condition applied to a PC
// who fails the save (a breath that also Poisons, a lair that Frightens). Both
// route through applyAoeSaveToParty, which now stamps the condition on failures.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../src/types.js';
import { applyAoeSaveToParty } from '../../src/services/gameEngine.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { makeChar } from '../../src/test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

function partyState(...chars: ReturnType<typeof makeChar>[]): GameState {
  return { characters: chars, entities: [], combat_active: true } as unknown as GameState;
}

describe('applyAoeSaveToParty — rider condition on a failed save', () => {
  it('poisons a PC who fails, leaves an immune PC unaffected', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d20 → 1 on every save → all fail
    const victim = makeChar({ id: 'v', con: 10, hp: 40, max_hp: 40 });
    const immune = makeChar({
      id: 'i',
      con: 10,
      hp: 40,
      max_hp: 40,
      condition_immunities: ['poisoned'],
    });
    const { st } = applyAoeSaveToParty(partyState(victim, immune), ctx, {
      dice: '2d6',
      damageType: 'poison',
      savingThrow: 'con',
      saveDC: 15,
      condition: 'poisoned',
      conditionDuration: 3,
    });
    const out = (id: string) => st.characters.find((c) => c.id === id)!;
    expect(out('v').conditions).toContain('poisoned');
    expect(out('v').condition_durations?.poisoned).toBe(3);
    expect(out('v').hp).toBeGreaterThan(0); // survived → condition lands
    expect(out('i').conditions).not.toContain('poisoned'); // immune
  });

  it('does not apply the condition to a PC who saves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20 → saves
    const pc = makeChar({ id: 'p', con: 16, hp: 40, max_hp: 40 });
    const { st } = applyAoeSaveToParty(partyState(pc), ctx, {
      dice: '2d6',
      damageType: 'poison',
      savingThrow: 'con',
      saveDC: 12,
      condition: 'poisoned',
    });
    expect(st.characters[0].conditions).not.toContain('poisoned');
  });
});
