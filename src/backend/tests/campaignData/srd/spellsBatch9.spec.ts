// SRD spell batch 9 (RE-6) — utility/narrative spells with no combat
// mechanics: Floating Disk, Magic Circle, Hallucinatory Terrain, Fabricate,
// Awaken, Seeming, Telepathic Bond, Move Earth. Each routes through the utility
// (narrative) path and is gated out of combat (outOfCombatOnly). Tests confirm
// catalog registration + a clean out-of-combat cast.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../../src/campaignData/srd/spells.js';
import type { Seed } from '../../../src/types.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const BATCH = [
  { id: 'floating_disk', level: 1 },
  { id: 'magic_circle', level: 3 },
  { id: 'hallucinatory_terrain', level: 4 },
  { id: 'fabricate', level: 4 },
  { id: 'awaken', level: 5 },
  { id: 'seeming', level: 5 },
  { id: 'telepathic_bond', level: 5 },
  { id: 'move_earth', level: 6 },
] as const;

describe('spell batch 9 — catalog', () => {
  it('registers each as an out-of-combat utility with a spell list and no combat payload', () => {
    for (const s of BATCH) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level).toBe(s.level);
      expect(spell.outOfCombatOnly).toBe(true);
      expect((spell.spellList ?? []).length).toBeGreaterThan(0);
      expect(spell.narrative).toBeTruthy();
      // Pure utility — no combat payload.
      expect(spell.damage ?? spell.heal ?? spell.condition ?? spell.savingThrow).toBeUndefined();
    }
  });

  it('carries the costly material components (Magic Circle 100 GP, Awaken 1000 GP)', () => {
    expect(SRD_SPELLS.magic_circle.materialCost).toBe(100);
    expect(SRD_SPELLS.awaken.materialCost).toBe(1000);
  });

  it('Floating Disk and Telepathic Bond are ritual-castable', () => {
    expect(SRD_SPELLS.floating_disk.ritualCasting).toBe(true);
    expect(SRD_SPELLS.telepathic_bond.ritualCasting).toBe(true);
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Batch 9 Test',
  ship_name: 'Batch 9 Test',
  intro: '',
  seed_id: 'batch9',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function casterState(spellId: string, slot: number) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 20,
    int: 18,
    // Awaken's 1000 GP component is deducted from gold on cast.
    gold: 5000,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    // No combat_active → out of combat, where these spells are castable.
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [wiz],
    active_character_id: 'pc-1',
  };
}

describe('spell batch 9 — casts resolve out of combat', () => {
  for (const s of BATCH) {
    it(`${s.id} produces a narrative and consumes its slot`, async () => {
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: s.id, slotLevel: s.level },
        history: [],
        state: casterState(s.id, s.level),
        seed,
        context: ctx,
      });
      expect(r.narrative).toBeTruthy();
      expect(r.narrative).not.toMatch(/Unknown spell|cannot|not prepared|only.*out of combat/i);
      expect(r.newState.characters[0].spell_slots_used?.[s.level]).toBe(1);
    });
  }
});
