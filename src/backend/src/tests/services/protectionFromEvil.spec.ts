// SRD Protection from Evil and Good (L1): pansori grants the testable slice —
// the warded creature has Advantage on saves vs Charmed/Frightened. Flag set on
// cast, cleared on concentration break.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'PFE Test',
  ship_name: 'PFE Test',
  intro: '',
  seed_id: 'pfe',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function partyState(): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    spell_slots_max: { 1: 3 },
    spell_slots_used: {},
    spells_known: ['protection_from_evil_and_good'],
    prepared_spells: ['protection_from_evil_and_good'],
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 5 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [caster, ally],
    active_character_id: 'pc-1',
  } as unknown as GameState;
}

describe('Protection from Evil and Good — ward vs charm/fear', () => {
  it('sets the ward flag on the target, then clears it on concentration break', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'protection_from_evil_and_good',
        slotLevel: 1,
        targetCharId: 'pc-2',
      },
      history: [],
      state: partyState(),
      seed,
      context: ctx,
    });
    const ally = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(ally.protected_from_evil).toBe(true);
    const caster = r.newState.characters[0];
    expect(caster.concentrating_on?.spellId).toBe('protection_from_evil_and_good');
    const { st: after } = breakConcentration(caster, r.newState, ctx);
    expect(after.characters.some((c) => c.protected_from_evil)).toBe(false);
  });
});
