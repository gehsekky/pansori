// 2024 PHB Fly (L3) and Levitate (L2). Both set fly_speed_ft on the
// target via the buff path; concentration drop clears it. Pansori
// approximates "vertical-only" Levitate as a 20 ft flying speed
// (the implied movement budget) and full Fly as 60 ft.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Fly/Levitate Test',
  ship_name: 'Fly/Levitate Test',
  intro: '',
  seed_id: 'fly-levitate',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [pc, ally] : [pc];
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
    characters: chars,
    active_character_id: pc.id,
  };
}

describe('Fly spell', () => {
  it('grants fly_speed_ft = 60 to a chosen ally', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      spells_known: ['fly'],
      spell_slots_max: { 3: 2 },
      spell_slots_used: { 3: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 5,
      hp: 4,
      max_hp: 40,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fly', slotLevel: 3, targetCharId: 'ally-1' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterAlly?.fly_speed_ft).toBe(60);
  });

  it('Wizard self-cast Fly sets caster fly_speed_ft', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      spells_known: ['fly'],
      spell_slots_max: { 3: 2 },
      spell_slots_used: { 3: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fly', slotLevel: 3 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.fly_speed_ft).toBe(60);
    expect(after?.concentrating_on?.spellId).toBe('fly');
  });

  it('concentration drop clears fly_speed_ft on every PC carrying it', () => {
    const caster = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      concentrating_on: { spellId: 'fly', rounds_left: 100 },
      fly_speed_ft: 60,
    });
    const ally = makeChar({ id: 'ally-1', character_class: 'Fighter', level: 5, fly_speed_ft: 60 });
    const state = buildState(caster, ally);
    const { char, st } = breakConcentration(caster, state, ctx);
    expect(char.fly_speed_ft).toBeUndefined();
    const afterAlly = st.characters.find((c) => c.id === 'ally-1');
    expect(afterAlly?.fly_speed_ft).toBeUndefined();
  });
});

describe('Levitate spell', () => {
  it('grants fly_speed_ft = 20 to a chosen ally', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      spells_known: ['levitate'],
      spell_slots_max: { 2: 3 },
      spell_slots_used: { 2: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Rogue',
      level: 5,
      hp: 6,
      max_hp: 30,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'levitate', slotLevel: 2, targetCharId: 'ally-1' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterAlly?.fly_speed_ft).toBe(20);
  });

  it('Levitate concentration drop clears the 20 ft flight', () => {
    const caster = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      concentrating_on: { spellId: 'levitate', rounds_left: 100 },
      fly_speed_ft: 20,
    });
    const state = buildState(caster);
    const { char } = breakConcentration(caster, state, ctx);
    expect(char.fly_speed_ft).toBeUndefined();
  });
});
