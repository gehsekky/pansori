// SRD utility / ritual spells (narrative): Alarm, Unseen Servant, Rope Trick,
// Water Breathing, Water Walk, Arcane Lock, Silence, Nondetection. These carry
// no combat mechanics — the tests confirm catalog registration and that a cast
// resolves through the utility (narrative) path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const BATCH = [
  { id: 'alarm', level: 1, ritual: true },
  { id: 'unseen_servant', level: 1, ritual: true },
  { id: 'rope_trick', level: 2, ritual: false },
  { id: 'water_breathing', level: 3, ritual: true },
  { id: 'water_walk', level: 3, ritual: true },
  { id: 'arcane_lock', level: 2, ritual: false },
  { id: 'silence', level: 2, ritual: true },
  { id: 'nondetection', level: 3, ritual: false },
  { id: 'magic_mouth', level: 2, ritual: true },
  { id: 'phantom_steed', level: 3, ritual: true },
  { id: 'find_traps', level: 2, ritual: false },
  { id: 'locate_creature', level: 4, ritual: false },
  { id: 'commune', level: 5, ritual: true },
  { id: 'divination', level: 4, ritual: true },
  { id: 'scrying', level: 5, ritual: false },
  { id: 'locate_animals_or_plants', level: 2, ritual: true },
] as const;

describe('utility-spell batch — catalog', () => {
  it('registers each spell with the expected level, ritual flag, and a spell list', () => {
    for (const s of BATCH) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level).toBe(s.level);
      expect(spell.ritualCasting ?? false).toBe(s.ritual);
      expect((spell.spellList ?? []).length).toBeGreaterThan(0);
      // Pure utility — no combat payload.
      expect(spell.damage ?? spell.heal ?? spell.condition).toBeUndefined();
    }
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Utility Test',
  ship_name: 'Utility Test',
  intro: '',
  seed_id: 'util',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function casterState(spellId: string, slot: number) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 9,
    int: 18,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [wiz],
    active_character_id: 'pc-1',
  };
}

describe('utility-spell batch — casts resolve', () => {
  it('Water Breathing produces a narrative and does not error', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'water_breathing', slotLevel: 3 },
      history: [],
      state: casterState('water_breathing', 3),
      seed,
      context: ctx,
    });
    expect(r.narrative).toBeTruthy();
    expect(r.narrative).not.toMatch(/Unknown spell|cannot|not prepared/i);
  });

  it('Arcane Lock (non-ritual) consumes its slot', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'arcane_lock', slotLevel: 2 },
      history: [],
      state: casterState('arcane_lock', 2),
      seed,
      context: ctx,
    });
    expect(r.narrative).toBeTruthy();
    expect(r.newState.characters[0].spell_slots_used?.[2]).toBe(1);
  });

  it('Locate Creature (a divination utility) resolves cleanly', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'locate_creature', slotLevel: 4 },
      history: [],
      state: casterState('locate_creature', 4),
      seed,
      context: ctx,
    });
    expect(r.narrative).toBeTruthy();
    expect(r.narrative).not.toMatch(/Unknown spell|cannot|not prepared/i);
  });
});
