// Bless target picker (FE option pickers) — the cast path honors the
// player-chosen `targetCharIds` (the FE collects them via the GameChoice
// `pickTargets` hint), instead of always auto-picking caster + nearest allies.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ctxWithRage, makeChar, makeState, spellSeed } from '../test-fixtures.js';
import { generateChoices, takeAction } from './gameEngine.js';
import type { GameState } from '../types.js';

afterEach(() => vi.restoreAllMocks());

function party(): GameState {
  const cleric = makeChar({
    id: 'cleric-1',
    character_class: 'Cleric',
    wis: 14,
    spell_slots_max: { 1: 2, 2: 1 },
    spells_known: ['bless'],
    prepared_spells: ['bless'],
  });
  const fighter = makeChar({ id: 'fighter-1', character_class: 'Fighter' });
  const rogue = makeChar({ id: 'rogue-1', character_class: 'Rogue' });
  return {
    ...makeState(),
    characters: [cleric, fighter, rogue],
    active_character_id: cleric.id,
    current_room: 'entry_hall',
    combat_active: false,
  };
}

describe('Bless target picker — honors chosen targetCharIds', () => {
  it('blesses only the chosen allies (caster excluded when not picked)', async () => {
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1, targetCharIds: ['fighter-1'] },
      history: [],
      state: party(),
      seed: spellSeed,
      context: ctxWithRage,
    });
    const blessed = result.newState.characters
      .filter((c) => c.conditions.includes('blessed'))
      .map((c) => c.id);
    expect(blessed).toEqual(['fighter-1']);
    // Caster still concentrates even though they didn't bless themselves.
    const caster = result.newState.characters.find((c) => c.id === 'cleric-1')!;
    expect(caster.concentrating_on?.spellId).toBe('bless');
    expect(caster.conditions).not.toContain('blessed');
  });

  it('blesses the chosen subset including the caster', async () => {
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'bless',
        slotLevel: 1,
        targetCharIds: ['cleric-1', 'rogue-1'],
      },
      history: [],
      state: party(),
      seed: spellSeed,
      context: ctxWithRage,
    });
    const blessed = result.newState.characters
      .filter((c) => c.conditions.includes('blessed'))
      .map((c) => c.id)
      .sort();
    expect(blessed).toEqual(['cleric-1', 'rogue-1']);
  });

  it('falls back to the auto-pick when no targets are provided', async () => {
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1 },
      history: [],
      state: party(),
      seed: spellSeed,
      context: ctxWithRage,
    });
    const blessed = result.newState.characters
      .filter((c) => c.conditions.includes('blessed'))
      .map((c) => c.id)
      .sort();
    expect(blessed).toEqual(['cleric-1', 'fighter-1', 'rogue-1']);
  });

  it('ignores dead / non-party ids and caps at the slot max', async () => {
    const state = party();
    state.characters[2].dead = true; // rogue is dead
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'bless',
        slotLevel: 1,
        targetCharIds: ['rogue-1', 'ghost-99', 'fighter-1', 'cleric-1'],
      },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    const blessed = result.newState.characters
      .filter((c) => c.conditions.includes('blessed'))
      .map((c) => c.id)
      .sort();
    // Dead rogue + bogus id dropped → fighter + cleric (≤ 3).
    expect(blessed).toEqual(['cleric-1', 'fighter-1']);
  });
});

describe('Bless target picker — choice carries the pickTargets hint', () => {
  it('the Bless cast choice is tagged pickTargets {ally, 3} at base level', () => {
    const choices = generateChoices(party(), spellSeed, ctxWithRage);
    const blessChoice = choices.find(
      (c) =>
        c.action.type === 'cast_spell' && c.action.spellId === 'bless' && c.action.slotLevel === 1
    );
    expect(blessChoice, 'expected a Bless cast choice').toBeDefined();
    expect(blessChoice!.pickTargets).toEqual({ side: 'ally', max: 3 });
  });

  it('an upcast Bless choice raises the max by the slot delta', () => {
    const choices = generateChoices(party(), spellSeed, ctxWithRage);
    const upcast = choices.find(
      (c) =>
        c.action.type === 'cast_spell' && c.action.spellId === 'bless' && c.action.slotLevel === 2
    );
    expect(upcast?.pickTargets).toEqual({ side: 'ally', max: 4 });
  });
});
