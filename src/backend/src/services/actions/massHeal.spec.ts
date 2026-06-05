// SRD Mass Healing Word (L3 bonus action) and Mass Cure Wounds
// (L5 action). Both route through the heal branch's mass-heal path,
// distributing the rolled heal across all living party members.
// Pansori MVP heals the whole party (RAW caps at 6 within 30 ft —
// pansori parties top out at 4, so the cap doesn't bite).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Mass Heal Test',
  ship_name: 'Mass Heal Test',
  intro: '',
  seed_id: 'mass-heal',
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

describe('Mass Healing Word', () => {
  it('heals every living party member', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      hp: 10,
      max_hp: 30,
      spells_known: ['mass_healing_word'],
      prepared_spells: ['mass_healing_word'],
      spell_slots_max: { 3: 2 },
      spell_slots_used: { 3: 0 },
    });
    const ally1 = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 5,
      hp: 5,
      max_hp: 40,
    });
    const ally2 = makeChar({
      id: 'ally-2',
      character_class: 'Rogue',
      level: 5,
      hp: 20,
      max_hp: 30,
    });
    const dead = makeChar({
      id: 'dead-1',
      character_class: 'Wizard',
      level: 5,
      hp: 0,
      max_hp: 25,
      dead: true,
    });
    const state = buildState(pc, ally1, ally2, dead);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'mass_healing_word', slotLevel: 3 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    const afterAlly1 = result.newState.characters.find((c) => c.id === 'ally-1');
    const afterAlly2 = result.newState.characters.find((c) => c.id === 'ally-2');
    const afterDead = result.newState.characters.find((c) => c.id === 'dead-1');
    // All living PCs gained HP.
    expect(afterPc?.hp ?? 0).toBeGreaterThan(10);
    expect(afterAlly1?.hp ?? 0).toBeGreaterThan(5);
    expect(afterAlly2?.hp ?? 0).toBeGreaterThan(20);
    // Caster's HP capped at max if heal would overshoot.
    expect(afterAlly2?.hp ?? 0).toBeLessThanOrEqual(30);
    // Dead PC stays dead.
    expect(afterDead?.hp).toBe(0);
  });

  it('consumes the spell slot + bonus action', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      hp: 20,
      max_hp: 30,
      spells_known: ['mass_healing_word'],
      prepared_spells: ['mass_healing_word'],
      spell_slots_max: { 3: 2 },
      spell_slots_used: { 3: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'mass_healing_word', slotLevel: 3 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.spell_slots_used?.[3]).toBe(1);
    expect(after?.turn_actions.bonus_action_used).toBe(true);
  });
});

describe('Mass Cure Wounds', () => {
  it('heals every living party member with the L5 dice', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 9,
      wis: 16,
      hp: 5,
      max_hp: 50,
      spells_known: ['mass_cure_wounds'],
      prepared_spells: ['mass_cure_wounds'],
      spell_slots_max: { 5: 1 },
      spell_slots_used: { 5: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 9,
      hp: 10,
      max_hp: 60,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'mass_cure_wounds', slotLevel: 5 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterPc?.hp ?? 0).toBeGreaterThan(5);
    expect(afterAlly?.hp ?? 0).toBeGreaterThan(10);
  });

  it('Life Cleric Disciple of Life bonus applies per-target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // min rolls
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      subclass: 'life',
      level: 9,
      wis: 16,
      hp: 5,
      max_hp: 50,
      spells_known: ['mass_cure_wounds'],
      prepared_spells: ['mass_cure_wounds'],
      spell_slots_max: { 5: 1 },
      spell_slots_used: { 5: 0 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 9,
      hp: 10,
      max_hp: 60,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'mass_cure_wounds', slotLevel: 5 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // Narrative names Disciple of Life so the bonus is visible.
    expect(result.narrative).toMatch(/Disciple of Life/);
  });
});
