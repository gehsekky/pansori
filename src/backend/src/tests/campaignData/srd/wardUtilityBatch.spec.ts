// SRD Abjuration wards + high-level utility batch: Dispel Magic, Nondetection,
// Glyph of Warding, Hallow, Forbiddance, True Seeing, Heroes' Feast.
// Most are narrated utility (catalog assertions); Heroes' Feast lands
// mechanically as a max-HP + condition-immunity + resistance buff.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('ward/utility batch — catalog', () => {
  it('all seven entries exist with their SRD levels and class lists', () => {
    expect(SRD_SPELLS.dispel_magic.level).toBe(3);
    expect(SRD_SPELLS.dispel_magic.spellList).toEqual(['arcane', 'divine', 'primal']);
    expect(SRD_SPELLS.nondetection.level).toBe(3);
    expect(SRD_SPELLS.nondetection.spellList).toEqual(['arcane', 'primal']);
    expect(SRD_SPELLS.glyph_of_warding.level).toBe(3);
    expect(SRD_SPELLS.hallow.level).toBe(5);
    expect(SRD_SPELLS.forbiddance.level).toBe(6);
    expect(SRD_SPELLS.true_seeing.level).toBe(6);
    expect(SRD_SPELLS.heroes_feast.level).toBe(6);
  });

  it('the slow-cast wards are gated to out-of-combat; Forbiddance is a ritual', () => {
    expect(SRD_SPELLS.glyph_of_warding.outOfCombatOnly).toBe(true);
    expect(SRD_SPELLS.hallow.outOfCombatOnly).toBe(true);
    expect(SRD_SPELLS.forbiddance.outOfCombatOnly).toBe(true);
    expect(SRD_SPELLS.forbiddance.ritualCasting).toBe(true);
  });

  it('material costs match the SRD components', () => {
    expect(SRD_SPELLS.nondetection.materialCost).toBe(25);
    expect(SRD_SPELLS.true_seeing.materialCost).toBe(25);
    expect(SRD_SPELLS.glyph_of_warding.materialCost).toBe(200);
    expect(SRD_SPELLS.hallow.materialCost).toBe(1000);
    expect(SRD_SPELLS.forbiddance.materialCost).toBe(1000);
    expect(SRD_SPELLS.heroes_feast.materialCost).toBe(1000);
  });

  it("Heroes' Feast carries the buff payload (max HP + immunities + resistance)", () => {
    const f = SRD_SPELLS.heroes_feast;
    expect(f.targetType).toBe('self_or_ally');
    expect(f.maxHpBonus).toBe(11);
    expect(f.grantResistances).toEqual(['poison']);
    expect(f.grantsConditionImmunities).toEqual(['frightened', 'poisoned']);
  });
});

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Ward Test',
  ship_name: 'Ward Test',
  intro: '',
  seed_id: 'ward',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe("Heroes' Feast — buff applies on cast", () => {
  it('bumps max + current HP and grants the poison/fear immunities + resistance', async () => {
    const cleric = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 11,
      wis: 18,
      hp: 50,
      max_hp: 50,
      gold: 2000,
      spells_known: ['heroes_feast'],
      prepared_spells: ['heroes_feast'],
      spell_slots_max: { 6: 1 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: false }),
      characters: [cleric],
      active_character_id: 'pc-1',
    };

    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'heroes_feast', slotLevel: 6 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });

    const pc = r.newState.characters[0];
    expect(pc.max_hp).toBe(61); // 50 + 11
    expect(pc.hp).toBe(61); // gains that many HP too
    expect(pc.spell_resistances).toEqual(['poison']);
    expect(pc.condition_immunities).toEqual(expect.arrayContaining(['frightened', 'poisoned']));
  });
});
