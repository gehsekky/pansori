// SRD Dispel Magic (pansori model): frees a chosen creature of the spell
// effects gripping it — strips the dispellable control conditions (Paralyzed,
// Frightened, …) while leaving non-magical/physical ones (Prone) in place.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Dispel Test',
  ship_name: 'Dispel Test',
  intro: '',
  seed_id: 'dispel',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function partyState(): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    spell_slots_max: { 3: 2 },
    spell_slots_used: {},
    spells_known: ['dispel_magic'],
    prepared_spells: ['dispel_magic'],
  });
  // The held ally: Paralyzed + Frightened (spell effects) AND Prone (physical).
  const ally = makeChar({
    id: 'pc-2',
    character_class: 'Fighter',
    level: 5,
    conditions: ['paralyzed', 'frightened', 'prone'],
    condition_durations: { paralyzed: 10, frightened: 10 },
    condition_sources: { frightened: 'enemy-1' },
    charmer_id: undefined,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [cleric, ally],
    active_character_id: 'pc-1',
  } as unknown as GameState;
}

describe('Dispel Magic — strip spell-origin control conditions', () => {
  it('frees an ally of Paralyzed + Frightened but leaves Prone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'dispel_magic', slotLevel: 3, targetCharId: 'pc-2' },
      history: [],
      state: partyState(),
      seed,
      context: ctx,
    });
    const ally = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(ally.conditions).not.toContain('paralyzed');
    expect(ally.conditions).not.toContain('frightened');
    expect(ally.conditions).toContain('prone'); // physical — not dispelled
    expect(ally.condition_durations?.paralyzed).toBeUndefined();
    expect(ally.condition_sources?.frightened).toBeUndefined();
  });
});
