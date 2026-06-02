// Buff-spell path tests — Heroism (temp HP), Aid (max HP bump),
// Greater Invisibility (condition + concentration). These spells
// target self / ally and don't require a living enemy.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Buff Spell Test',
  ship_name: 'Buff Spell Test',
  intro: '',
  seed_id: 'buff',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildCasterParty(caster: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [caster, ally] : [caster];
  return {
    ...makeState({ id: caster.id }, { current_room: 'entry_hall' }),
    characters: chars,
    active_character_id: caster.id,
  };
}

describe('Heroism — temp HP grant', () => {
  it('Cleric self-casts Heroism: gets 3 temp HP, becomes concentrating', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['heroism'],
      prepared_spells: ['heroism'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const state = buildCasterParty(cleric);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'heroism', slotLevel: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.temp_hp).toBe(3);
    expect(after.concentrating_on?.spellId).toBe('heroism');
  });

  it('Cleric casts Heroism on ally (explicit targetCharId): ally gets temp HP', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['heroism'],
      prepared_spells: ['heroism'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const fighter = makeChar({ id: 'fighter-1', character_class: 'Fighter' });
    const state = buildCasterParty(cleric, fighter);
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'heroism',
        slotLevel: 1,
        targetCharId: 'fighter-1',
      } as never,
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const afterFighter = result.newState.characters.find((c) => c.id === 'fighter-1');
    const afterCleric = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(afterFighter?.temp_hp).toBe(3);
    expect(afterCleric?.temp_hp ?? 0).toBe(0); // caster didn't get it
    // Concentration sits on the caster either way.
    expect(afterCleric?.concentrating_on?.spellId).toBe('heroism');
  });
});

describe('Aid — max HP bump', () => {
  it('Cleric self-casts Aid at L2: +5 max HP and +5 current HP', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      hp: 20,
      max_hp: 30,
      spells_known: ['aid'],
      prepared_spells: ['aid'],
      spell_slots_max: { 2: 2 },
      spell_slots_used: {},
    });
    const state = buildCasterParty(cleric);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'aid', slotLevel: 2 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.max_hp).toBe(35);
    expect(after.hp).toBe(25);
  });

  it('Aid at L3 (upcast): +10 max HP', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      hp: 20,
      max_hp: 30,
      spells_known: ['aid'],
      prepared_spells: ['aid'],
      spell_slots_max: { 2: 1, 3: 1 },
      spell_slots_used: {},
    });
    const state = buildCasterParty(cleric);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'aid', slotLevel: 3 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.max_hp).toBe(40);
    expect(after.hp).toBe(30);
  });
});

describe('Greater Invisibility — condition + concentration', () => {
  it('Wizard self-casts: invisible condition + concentration', async () => {
    const wizard = makeChar({
      id: 'wizard-1',
      character_class: 'Wizard',
      level: 7,
      int: 16,
      spells_known: ['greater_invisibility'],
      prepared_spells: ['greater_invisibility'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: {},
    });
    const state = buildCasterParty(wizard);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'greater_invisibility', slotLevel: 4 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.conditions).toContain('invisible');
    expect(after.concentrating_on?.spellId).toBe('greater_invisibility');
  });
});
