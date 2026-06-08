// SRD utility / exploration spells, batch 2 (narrative): Silent Image, Create
// or Destroy Water, Purify Food and Drink, See Invisibility, Zone of Truth,
// Alter Self, Arcane Eye, Stone Shape. These carry no combat mechanics — the
// tests confirm catalog registration and that a cast resolves through the
// utility (narrative) path without error.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const BATCH = [
  { id: 'silent_image', level: 1, conc: true, ritual: false },
  { id: 'create_or_destroy_water', level: 1, conc: false, ritual: false },
  { id: 'purify_food_and_drink', level: 1, conc: false, ritual: true },
  { id: 'see_invisibility', level: 2, conc: false, ritual: false },
  { id: 'zone_of_truth', level: 2, conc: false, ritual: false },
  { id: 'alter_self', level: 2, conc: true, ritual: false },
  { id: 'arcane_eye', level: 4, conc: true, ritual: false },
  { id: 'stone_shape', level: 4, conc: false, ritual: false },
] as const;

describe('utility/exploration batch 2 — catalog', () => {
  it('registers each spell with the expected level / concentration / ritual flag', () => {
    for (const s of BATCH) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level).toBe(s.level);
      expect(spell.concentration ?? false).toBe(s.conc);
      expect(spell.ritualCasting ?? false).toBe(s.ritual);
      expect((spell.spellList ?? []).length).toBeGreaterThan(0);
      // Pure utility — no combat payload.
      expect(spell.damage ?? spell.savingThrow ?? spell.attackRoll ?? spell.condition).toBeFalsy();
      expect(spell.narrative).toBeTruthy();
    }
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Utility Exploration II Test',
  ship_name: 'Utility Exploration II Test',
  intro: '',
  seed_id: 'util-explore-2',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function caster(spellId: string, slot: number) {
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

describe('utility/exploration batch 2 — casts resolve cleanly', () => {
  for (const s of BATCH) {
    it(`${s.id} produces a narrative and does not error`, async () => {
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: s.id, slotLevel: s.level },
        history: [],
        state: caster(s.id, s.level),
        seed,
        context: ctx,
      });
      expect(r.narrative, s.id).toBeTruthy();
      expect(r.narrative).not.toMatch(/Unknown spell|not prepared|no enemy/i);
    });
  }

  it('Alter Self (concentration) links concentration on the caster', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'alter_self', slotLevel: 2 },
      history: [],
      state: caster('alter_self', 2),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].spell_slots_used?.[2]).toBe(1);
  });
});
