// 2024 PHB Ritual Casting (Chapter 3). Spells tagged with
// `ritualCasting: true` can be cast as a 10-minute ritual without
// expending a slot, out of combat. Pansori models the 10-minute
// time cost as "out of combat" (no finer-grained time axis).
//
// Class eligibility: Wizard / Cleric / Druid / Bard.
// Spells used in these tests are the three SRD ritual utilities just
// added to the catalog (Detect Magic, Identify, Comprehend Languages).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Ritual Casting Test',
  ship_name: 'Ritual Casting Test',
  intro: '',
  seed_id: 'ritual-casting',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>, combat = false) {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: combat }),
    characters: [pc],
    active_character_id: pc.id,
  };
}

describe('Ritual cast — choice surfacing', () => {
  it('Wizard out of combat with Detect Magic known sees the ritual choice', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['detect_magic'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 4 }, // all slots burned — only ritual is viable
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const ritual = choices.find(
      (c) =>
        c.action.type === 'cast_spell' &&
        c.action.spellId === 'detect_magic' &&
        c.action.ritual === true
    );
    expect(ritual).toBeDefined();
  });

  it('Sorcerer (non-ritual class) does NOT see the ritual choice', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 5,
      spells_known: ['detect_magic'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 4 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const ritual = choices.find(
      (c) =>
        c.action.type === 'cast_spell' &&
        c.action.spellId === 'detect_magic' &&
        c.action.ritual === true
    );
    expect(ritual).toBeUndefined();
  });

  it('Cleric in combat does NOT see the ritual choice', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      spells_known: ['detect_magic'],
      prepared_spells: ['detect_magic'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
    });
    const state = buildState(pc, true);
    const choices = generateChoices(state, seed, ctx);
    const ritual = choices.find(
      (c) =>
        c.action.type === 'cast_spell' &&
        c.action.spellId === 'detect_magic' &&
        c.action.ritual === true
    );
    expect(ritual).toBeUndefined();
  });

  it('Ritual + slot choices both surface when slot is available', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['detect_magic'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const ritual = choices.filter(
      (c) =>
        c.action.type === 'cast_spell' &&
        c.action.spellId === 'detect_magic' &&
        c.action.ritual === true
    );
    const slot = choices.filter(
      (c) =>
        c.action.type === 'cast_spell' && c.action.spellId === 'detect_magic' && !c.action.ritual
    );
    expect(ritual.length).toBe(1);
    expect(slot.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Ritual cast — handler', () => {
  it('burns no slot when cast as a ritual', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['detect_magic'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 2 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'detect_magic', slotLevel: 1, ritual: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.spell_slots_used?.[1]).toBe(2); // unchanged
  });

  it('rejects ritual cast on a non-ritual spell', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['magic_missile'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'magic_missile', slotLevel: 1, ritual: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/cannot be cast as a ritual/i);
  });

  it('rejects ritual cast in combat', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['detect_magic'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
    });
    const state = buildState(pc, true);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'detect_magic', slotLevel: 1, ritual: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/10 minutes|not usable in combat/i);
  });

  it('Identify ritual still consumes its 100 gp material component', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['identify'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
      gold: 200,
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'identify', slotLevel: 1, ritual: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.gold).toBe(100); // 200 - 100 gp pearl
    expect(after?.spell_slots_used?.[1]).toBe(0); // ritual, no slot
  });

  it('Identify ritual rejected when gold is insufficient', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['identify'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
      gold: 50,
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'identify', slotLevel: 1, ritual: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/100 gp/);
  });

  it('Comprehend Languages ritual emits the spell narrative', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      level: 5,
      spells_known: ['comprehend_languages'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'comprehend_languages',
        slotLevel: 1,
        ritual: true,
      },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/foreign tongues resolve/i);
  });
});
