// SRD Longstrider (L1): touch a creature, +10 ft Speed for 1 hour (not
// concentration). Modeled via Character.longstrider_active, read by effectiveSpeed.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectiveSpeed, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Longstrider Test',
  ship_name: 'Longstrider Test',
  intro: '',
  seed_id: 'longstrider',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function casterState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 16,
    speed: 30,
    spell_slots_max: { 1: 3 },
    spell_slots_used: {},
    spells_known: ['longstrider'],
    prepared_spells: ['longstrider'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [char],
    active_character_id: 'pc-1',
  } as unknown as GameState;
}

describe('Longstrider — +10 ft Speed (not concentration)', () => {
  it('sets the flag and bumps effectiveSpeed by 10', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const before = effectiveSpeed(casterState().characters[0], ctx.lootTable);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'longstrider', slotLevel: 1, targetCharId: 'pc-1' },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.longstrider_active).toBe(true);
    expect(c.concentrating_on?.spellId).not.toBe('longstrider'); // not concentration
    expect(effectiveSpeed(c, ctx.lootTable)).toBe(before + 10);
  });
});
