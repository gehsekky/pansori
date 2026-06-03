// SRD spell batch 10 (RE-6) — illusion & enchantment. Major Image + Programmed
// Illusion (illusions), Geas + Modify Memory (enchantment social/downtime), and
// Mislead — the one mechanical entry (the caster gains the shared `invisible`
// condition; the illusory double is narrated). Programmed Illusion / Geas /
// Modify Memory are out-of-combat utility; Major Image rides the narrative path
// like Silent Image; Mislead rides the self-condition buff path like Blur.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const BATCH = [
  { id: 'major_image', level: 3 },
  { id: 'mislead', level: 5 },
  { id: 'programmed_illusion', level: 6 },
  { id: 'geas', level: 5 },
  { id: 'modify_memory', level: 5 },
] as const;

describe('spell batch 10 — catalog', () => {
  it('registers each at the right level with a spell list + description', () => {
    for (const s of BATCH) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level, s.id).toBe(s.level);
      expect((spell.spellList ?? []).length, s.id).toBeGreaterThan(0);
      expect(spell.desc, s.id).toBeTruthy();
    }
  });

  it('the illusion/enchantment utilities carry no combat payload (Mislead excepted)', () => {
    for (const id of ['major_image', 'programmed_illusion', 'geas', 'modify_memory'] as const) {
      const spell = SRD_SPELLS[id];
      expect(
        spell.damage ?? spell.heal ?? spell.condition ?? spell.savingThrow,
        id
      ).toBeUndefined();
    }
  });

  it('Programmed Illusion / Geas / Modify Memory are out-of-combat utilities', () => {
    expect(SRD_SPELLS.programmed_illusion.outOfCombatOnly).toBe(true);
    expect(SRD_SPELLS.geas.outOfCombatOnly).toBe(true);
    expect(SRD_SPELLS.modify_memory.outOfCombatOnly).toBe(true);
    // Programmed Illusion's jade-dust component (25+ GP).
    expect(SRD_SPELLS.programmed_illusion.materialCost).toBe(25);
  });

  it('Mislead turns the caster Invisible (self, concentration)', () => {
    expect(SRD_SPELLS.mislead.condition).toBe('invisible');
    expect(SRD_SPELLS.mislead.targetType).toBe('self');
    expect(SRD_SPELLS.mislead.concentration).toBe(true);
    expect(SRD_SPELLS.mislead.outOfCombatOnly ?? false).toBe(false);
  });

  it('Geas is on the arcane, divine, AND primal lists (Bard/Cleric/Druid/Paladin/Wizard)', () => {
    expect(SRD_SPELLS.geas.spellList).toEqual(
      expect.arrayContaining(['arcane', 'divine', 'primal'])
    );
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Batch 10 Test',
  ship_name: 'Batch 10 Test',
  intro: '',
  seed_id: 'batch10',
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
    gold: 5000,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  // Out of combat (no combat_active) — where these are castable.
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [wiz],
    active_character_id: 'pc-1',
  };
}

describe('spell batch 10 — casts resolve out of combat', () => {
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

  it('Mislead applies the Invisible condition to the caster', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'mislead', slotLevel: 5 },
      history: [],
      state: casterState('mislead', 5),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].conditions).toContain('invisible');
  });
});
