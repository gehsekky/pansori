// Heroism — grants immunity to Frightened (+ 3 temp HP). Pass without Trace —
// flags the whole party with a +10 Stealth aura bound to concentration.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Buff2 Test',
  ship_name: 'Buff2 Test',
  intro: '',
  seed_id: 'buff2',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function party(spellId: string, slot: number): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: spellId === 'pass_without_trace' ? 'Druid' : 'Bard',
    level: 5,
    wis: 16,
    cha: 16,
    spell_slots_max: { [slot]: 2 },
    spell_slots_used: {},
    spells_known: [spellId],
    prepared_spells: [spellId],
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 5 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [caster, ally],
    active_character_id: 'pc-1',
  } as unknown as GameState;
}

describe('Heroism — immunity to Frightened', () => {
  it('grants the Frightened immunity (and temp HP) to the target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'heroism', slotLevel: 1, targetCharId: 'pc-2' },
      history: [],
      state: party('heroism', 1),
      seed,
      context: ctx,
    });
    const ally = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(ally.condition_immunities).toContain('frightened');
    expect(ally.temp_hp).toBe(3);
  });
});

describe('Pass without Trace — party Stealth aura', () => {
  it('flags every party member, then clears on concentration break', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'pass_without_trace', slotLevel: 2 },
      history: [],
      state: party('pass_without_trace', 2),
      seed,
      context: ctx,
    });
    expect(r.newState.characters.every((c) => c.pass_without_trace_active)).toBe(true);
    const caster = r.newState.characters[0];
    expect(caster.concentrating_on?.spellId).toBe('pass_without_trace');
    // Dropping concentration clears the aura from the whole party.
    const { st: after } = breakConcentration(caster, r.newState, ctx);
    expect(after.characters.some((c) => c.pass_without_trace_active)).toBe(false);
  });
});
