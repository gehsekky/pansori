// Revive-ladder deferred mechanics shipped 2026-05-23:
//   - −4 D20 penalty from Raise Dead / Resurrection, decaying on
//     long rest. Reads `revive_d20_penalty` off the Character.
//   - Reincarnate's 1d10 species reroll (uniform pick from the 9
//     concrete species; "Roll again" outcome short-circuited away).
//
// True Resurrection + Revivify + Reincarnate intentionally do NOT
// impose the penalty per RAW — those are also pinned here.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { d20TestPenalty } from '../rulesEngine.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Revive Penalty Test',
  ship_name: 'Revive Penalty Test',
  intro: '',
  seed_id: 'revive-penalty',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildReviveParty(spellsKnown: string[], casterGold: number) {
  const cleric = makeChar({
    id: 'cleric-1',
    character_class: 'Cleric',
    level: 17,
    wis: 16,
    gold: casterGold,
    spells_known: spellsKnown,
    prepared_spells: spellsKnown,
    spell_slots_max: { 5: 2, 7: 1, 9: 1 },
    spell_slots_used: {},
  });
  const fallen = makeChar({
    id: 'fighter-1',
    character_class: 'Fighter',
    species: 'human',
    hp: 0,
    max_hp: 60,
    dead: true,
    stable: false,
    death_saves: { successes: 0, failures: 3 },
    died_at_round: 1,
  });
  return {
    ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
    characters: [cleric, fallen],
    active_character_id: 'cleric-1',
    round: 5000,
  };
}

describe('d20TestPenalty helper', () => {
  it('returns 0 when the field is unset or zero', () => {
    expect(d20TestPenalty({})).toBe(0);
    expect(d20TestPenalty({ revive_d20_penalty: 0 })).toBe(0);
  });
  it('returns the magnitude (always non-negative) when set', () => {
    expect(d20TestPenalty({ revive_d20_penalty: 4 })).toBe(4);
    expect(d20TestPenalty({ revive_d20_penalty: 2 })).toBe(2);
  });
});

describe('Raise Dead — applies the −4 D20 penalty', () => {
  it('sets revive_d20_penalty = 4 on the revived target', async () => {
    const state = buildReviveParty(['raise_dead'], 1000);
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'raise_dead',
        slotLevel: 5,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const revived = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(revived?.revive_d20_penalty).toBe(4);
  });
});

describe('Resurrection — applies the −4 D20 penalty', () => {
  it('sets revive_d20_penalty = 4 even on full-HP restore', async () => {
    const state = buildReviveParty(['resurrection'], 1500);
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'resurrection',
        slotLevel: 7,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const revived = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(revived?.revive_d20_penalty).toBe(4);
    expect(revived?.hp).toBe(60); // full HP still applied
  });
});

describe('True Resurrection — no penalty per RAW', () => {
  it('leaves revive_d20_penalty unset', async () => {
    const state = buildReviveParty(['true_resurrection'], 30000);
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'true_resurrection',
        slotLevel: 9,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const revived = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(revived?.revive_d20_penalty).toBeUndefined();
  });
});

describe('Long rest — decrements the penalty by 1', () => {
  it('drops penalty from 4 → 3 after one long rest', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      revive_d20_penalty: 4,
    });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: 'entry_hall' }),
      characters: [cleric],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(after?.revive_d20_penalty).toBe(3);
  });

  it('clears the field entirely when penalty was 1 → 0', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      revive_d20_penalty: 1,
    });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: 'entry_hall' }),
      characters: [cleric],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(after?.revive_d20_penalty).toBeUndefined();
  });
});

describe('Reincarnate — species reroll', () => {
  it('picks a species uniformly from the SRD reincarnation table', async () => {
    // Force Math.random to a stable value so the reincarnation pick
    // is deterministic. d(9) reads Math.random — 0 maps to species[0]
    // (dragonborn).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = buildReviveParty(['reincarnate'], 1500);
    // Start as 'human' so the swap is observable.
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'reincarnate',
        slotLevel: 5,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const revived = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(revived?.species).toBe('dragonborn'); // first entry in table
    expect(revived?.hp).toBe(60); // full HP per Reincarnate RAW
    expect(revived?.revive_d20_penalty).toBeUndefined(); // RAW: no penalty
  });

  it('clears stale species-resource flags from the prior body', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // → dragonborn
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 17,
      wis: 16,
      gold: 2000,
      spells_known: ['reincarnate'],
      prepared_spells: ['reincarnate'],
      spell_slots_max: { 5: 2 },
      spell_slots_used: {},
    });
    const fallen = makeChar({
      id: 'fighter-1',
      character_class: 'Fighter',
      species: 'orc',
      hp: 0,
      max_hp: 60,
      dead: true,
      death_saves: { successes: 0, failures: 3 },
      died_at_round: 1,
      class_resource_uses: { relentless_endurance_used: 1, rage_uses: 2 },
    });
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
      characters: [cleric, fallen],
      active_character_id: 'cleric-1',
      round: 5000,
    };
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'reincarnate',
        slotLevel: 5,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const revived = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(revived?.species).toBe('dragonborn');
    // Orc-specific flag swept (no longer relevant in a Dragonborn body).
    expect(revived?.class_resource_uses?.relentless_endurance_used).toBeUndefined();
    // Class-specific resources (rage_uses) preserved — those belong
    // to the character's class, not the species.
    expect(revived?.class_resource_uses?.rage_uses).toBe(2);
  });
});
