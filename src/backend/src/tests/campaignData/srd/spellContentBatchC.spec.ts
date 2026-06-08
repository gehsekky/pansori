// SRD spell content batch C (RE-6) — Plant Growth, Control Water, Tree Stride,
// Wind Walk, Control Weather. Environmental / travel utility spells with no
// combat mechanics: they route through the utility (narrative) path and are
// gated out of combat. Tests confirm catalog registration + a clean cast.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const BATCH = [
  { id: 'plant_growth', level: 3 },
  { id: 'control_water', level: 4 },
  { id: 'tree_stride', level: 5 },
  { id: 'wind_walk', level: 6 },
  { id: 'control_weather', level: 8 },
] as const;

describe('spell content batch C — catalog', () => {
  it('registers each spell as an out-of-combat utility with a spell list and no combat payload', () => {
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
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Batch C Test',
  ship_name: 'Batch C Test',
  intro: '',
  seed_id: 'batchC',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function druidState(spellId: string, slot: number) {
  const druid = makeChar({
    id: 'pc-1',
    character_class: 'Druid',
    level: 20,
    wis: 18,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    // No combat_active → out-of-combat, where these spells are castable.
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [druid],
    active_character_id: 'pc-1',
  };
}

describe('spell content batch C — casts resolve out of combat', () => {
  for (const s of BATCH) {
    it(`${s.id} produces a narrative and consumes its slot`, async () => {
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: s.id, slotLevel: s.level },
        history: [],
        state: druidState(s.id, s.level),
        seed,
        context: ctx,
      });
      expect(r.narrative).toBeTruthy();
      expect(r.narrative).not.toMatch(/Unknown spell|cannot|not prepared|only.*out of combat/i);
      expect(r.newState.characters[0].spell_slots_used?.[s.level]).toBe(1);
    });
  }
});
