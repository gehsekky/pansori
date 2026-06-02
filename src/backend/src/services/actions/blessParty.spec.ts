// Regression test for Bless on a 4+-member party.
//
// **Pre-existing sed-translation bug** (PR 15 era, fixed manually
// in PR 17 per docs/TODO.md): the iteration cap inside the Bless
// handler used `return` instead of `break`, which exited the whole
// handler before the bless effect ever applied. Only triggered
// when the party had 4+ members — the 3-target cap kicked in and
// the early `return` bailed before writing state. No test
// exercised the path, so the regression sat silent.
//
// Documented in castSpell.ts: "PR 15 sed regression — restored to
// `break`." This spec pins the contract.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const minimalSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Bless 4+ Test',
  ship_name: 'Bless 4+ Test',
  intro: '',
  seed_id: 'bless-party',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Bless — 4+-party member cap', () => {
  it('applies blessed to caster + 2 allies (3 total) and stops there', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 3,
      wis: 16,
      spells_known: ['bless'],
      prepared_spells: ['bless'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const allies = ['ally-1', 'ally-2', 'ally-3'].map((id) =>
      makeChar({ id, name: id, character_class: 'Fighter' })
    );
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
      characters: [cleric, ...allies],
      active_character_id: 'cleric-1',
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1 },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    const next = result.newState.characters;
    // Caster + first 2 allies → blessed. Third ally → not blessed
    // (RAW: Bless caps at 3 targets).
    expect(next.find((c) => c.id === 'cleric-1')?.conditions).toContain('blessed');
    expect(next.find((c) => c.id === 'ally-1')?.conditions).toContain('blessed');
    expect(next.find((c) => c.id === 'ally-2')?.conditions).toContain('blessed');
    expect(next.find((c) => c.id === 'ally-3')?.conditions).not.toContain('blessed');
  });

  it('still applies blessed when the party has exactly 3 members (no break needed)', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 3,
      wis: 16,
      spells_known: ['bless'],
      prepared_spells: ['bless'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const allies = ['ally-1', 'ally-2'].map((id) =>
      makeChar({ id, name: id, character_class: 'Fighter' })
    );
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
      characters: [cleric, ...allies],
      active_character_id: 'cleric-1',
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1 },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    const next = result.newState.characters;
    expect(next.find((c) => c.id === 'cleric-1')?.conditions).toContain('blessed');
    expect(next.find((c) => c.id === 'ally-1')?.conditions).toContain('blessed');
    expect(next.find((c) => c.id === 'ally-2')?.conditions).toContain('blessed');
  });

  it('skips dead allies — caster + 2 living allies even when a 5-person party has corpses', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 3,
      wis: 16,
      spells_known: ['bless'],
      prepared_spells: ['bless'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const livingAllies = ['ally-alive-1', 'ally-alive-2'].map((id) =>
      makeChar({ id, name: id, character_class: 'Fighter' })
    );
    const deadAlly = makeChar({
      id: 'ally-dead',
      name: 'Fallen',
      character_class: 'Fighter',
      dead: true,
    });
    const liveSpare = makeChar({
      id: 'ally-spare',
      name: 'Spare',
      character_class: 'Fighter',
    });
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
      // Insertion order matters — caster, two live, one dead, one extra live.
      characters: [cleric, livingAllies[0], deadAlly, livingAllies[1], liveSpare],
      active_character_id: 'cleric-1',
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1 },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    const next = result.newState.characters;
    expect(next.find((c) => c.id === 'cleric-1')?.conditions).toContain('blessed');
    expect(next.find((c) => c.id === 'ally-alive-1')?.conditions).toContain('blessed');
    expect(next.find((c) => c.id === 'ally-alive-2')?.conditions).toContain('blessed');
    // Cap of 3 reached; the extra live ally is not blessed.
    expect(next.find((c) => c.id === 'ally-spare')?.conditions).not.toContain('blessed');
    // Dead allies are skipped (continue inside the loop), not blessed.
    expect(next.find((c) => c.id === 'ally-dead')?.conditions ?? []).not.toContain('blessed');
  });
});
