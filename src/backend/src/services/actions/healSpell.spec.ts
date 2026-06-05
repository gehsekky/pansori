// SRD Heal (L6). Big single-target heal — 70 HP fixed (+10
// per slot above 6th). Also cures Blinded / Deafened / Poisoned
// per SRD: "This spell also ends the Blinded, Deafened, and
// Poisoned conditions on the target." Wired via the new
// `Spell.removeConditions` field consumed by the heal branch.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Heal Test',
  ship_name: 'Heal Test',
  intro: '',
  seed_id: 'heal',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(...chars: ReturnType<typeof makeChar>[]) {
  return {
    ...makeState({ id: chars[0].id }, { current_room: 'entry_hall' }),
    characters: chars,
    active_character_id: chars[0].id,
  };
}

describe('Heal (L6)', () => {
  it('restores 70 HP + casting mod to the most-injured ally', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 11,
      wis: 16,
      hp: 50,
      max_hp: 70,
      spells_known: ['heal'],
      prepared_spells: ['heal'],
      spell_slots_max: { 6: 1 },
      spell_slots_used: { 6: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 11,
      hp: 3,
      max_hp: 80,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'heal', slotLevel: 6 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    // Heal: 70 + WIS mod (3). 3 (current) + 73 = 76 ≤ 80 (max).
    expect(afterAlly?.hp).toBe(76);
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(afterPc?.spell_slots_used?.[6]).toBe(1);
  });

  it('caps the heal at the target max HP', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 11,
      wis: 16,
      spells_known: ['heal'],
      prepared_spells: ['heal'],
      spell_slots_max: { 6: 1 },
      spell_slots_used: { 6: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Rogue',
      level: 11,
      hp: 65,
      max_hp: 70,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'heal', slotLevel: 6 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterAlly?.hp).toBe(70); // capped
  });

  it('upcast at slot 7 adds +10 HP to the heal', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 13,
      wis: 16,
      hp: 50,
      max_hp: 80,
      spells_known: ['heal'],
      prepared_spells: ['heal'],
      spell_slots_max: { 7: 1 },
      spell_slots_used: { 7: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 13,
      hp: 3,
      max_hp: 200, // big pool so the upcast bonus shows
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'heal', slotLevel: 7 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    // 70 (base) + 10 (upcast) + 3 (WIS mod) = 83. 3 + 83 = 86.
    expect(afterAlly?.hp).toBe(86);
  });

  it('strips Blinded / Deafened / Poisoned from the target', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 11,
      wis: 16,
      hp: 60,
      max_hp: 70,
      spells_known: ['heal'],
      prepared_spells: ['heal'],
      spell_slots_max: { 6: 1 },
      spell_slots_used: { 6: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 11,
      hp: 10,
      max_hp: 80,
      conditions: ['blinded', 'poisoned', 'frightened'],
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'heal', slotLevel: 6 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterAlly?.conditions).not.toContain('blinded');
    expect(afterAlly?.conditions).not.toContain('poisoned');
    // Frightened is NOT on the strip list, so it persists.
    expect(afterAlly?.conditions).toContain('frightened');
  });
});
