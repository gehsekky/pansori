// SRD utility / exploration spells (narrative): Fog Cloud, Jump, Expeditious
// Retreat, Spider Climb, Darkvision, Gaseous Form, Clairvoyance, Create Food
// and Water. These carry no combat mechanics — the tests confirm catalog
// registration and that a cast resolves through the utility (narrative) path
// without error.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const BATCH = [
  { id: 'fog_cloud', level: 1, conc: true },
  { id: 'jump', level: 1, conc: false },
  { id: 'expeditious_retreat', level: 1, conc: true },
  { id: 'spider_climb', level: 2, conc: true },
  { id: 'darkvision', level: 2, conc: false },
  { id: 'gaseous_form', level: 3, conc: true },
  { id: 'clairvoyance', level: 3, conc: true },
  { id: 'create_food_and_water', level: 3, conc: false },
] as const;

describe('utility/exploration batch — catalog', () => {
  it('registers each spell with the expected level, concentration flag, and a spell list', () => {
    for (const s of BATCH) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level).toBe(s.level);
      expect(spell.concentration ?? false).toBe(s.conc);
      expect((spell.spellList ?? []).length).toBeGreaterThan(0);
      // Pure utility — no combat payload (no damage / save / attack / condition).
      expect(spell.damage ?? spell.savingThrow ?? spell.attackRoll ?? spell.condition).toBeFalsy();
      expect(spell.narrative).toBeTruthy();
    }
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Utility Exploration Test',
  ship_name: 'Utility Exploration Test',
  intro: '',
  seed_id: 'util-explore',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
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
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
    characters: [wiz],
    active_character_id: 'pc-1',
  };
}

describe('utility/exploration batch — casts resolve cleanly', () => {
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

  it('Fog Cloud (concentration) consumes its slot', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fog_cloud', slotLevel: 1 },
      history: [],
      state: caster('fog_cloud', 1),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].spell_slots_used?.[1]).toBe(1);
  });
});
