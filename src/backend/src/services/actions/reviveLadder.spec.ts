// Revive ladder — Raise Dead / Resurrection / True Resurrection /
// Reincarnate. Each plugs into the same runReviveSpell branch as
// Revivify; the differences are window length, material cost, and
// hpRestored value. These tests pin the per-spell wiring + verify
// that the sentinel `windowRounds: 99999` short-circuits the
// death-window gate (so a death many rounds ago still revives).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Revive Ladder Test',
  ship_name: 'Revive Ladder Test',
  intro: '',
  seed_id: 'revive-ladder',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildReviveParty(
  spellsKnown: string[],
  casterGold: number,
  fallenOverrides: Partial<Parameters<typeof makeChar>[0]> = {}
) {
  const cleric = makeChar({
    id: 'cleric-1',
    character_class: 'Cleric',
    level: 17,
    wis: 16,
    gold: casterGold,
    spells_known: spellsKnown,
    prepared_spells: spellsKnown,
    spell_slots_max: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
    spell_slots_used: {},
  });
  const fallen = makeChar({
    id: 'fighter-1',
    character_class: 'Fighter',
    hp: 0,
    max_hp: 60,
    dead: true,
    stable: false,
    death_saves: { successes: 0, failures: 3 },
    died_at_round: 1,
    ...fallenOverrides,
  });
  return {
    ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
    characters: [cleric, fallen],
    active_character_id: 'cleric-1',
    // Far past Revivify's 10-round window — proves the sentinel skip.
    round: 5000,
  };
}

describe('Raise Dead (L5)', () => {
  it('restores 1 HP, bypasses Revivify-window expiry via sentinel', async () => {
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
    expect(revived?.dead).toBe(false);
    expect(revived?.hp).toBe(1);
    const cleric = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(cleric?.gold).toBe(1000 - 500);
    expect(cleric?.spell_slots_used?.[5]).toBe(1);
  });

  it('fails when the caster lacks the 500 gp diamond', async () => {
    const state = buildReviveParty(['raise_dead'], 100);
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
    const stillDead = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(stillDead?.dead).toBe(true);
    expect(result.narrative).toMatch(/material component/i);
  });
});

describe('Resurrection (L7)', () => {
  it('restores target to FULL HP regardless of pre-death max_hp', async () => {
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
    expect(revived?.dead).toBe(false);
    expect(revived?.hp).toBe(60); // = max_hp
    const cleric = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(cleric?.gold).toBe(1500 - 1000);
  });
});

describe('True Resurrection (L9)', () => {
  it('restores target to FULL HP and consumes 25,000 gp', async () => {
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
    expect(revived?.dead).toBe(false);
    expect(revived?.hp).toBe(60);
    const cleric = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(cleric?.gold).toBe(30000 - 25000);
  });

  it('fails when the caster lacks the 25,000 gp diamonds', async () => {
    const state = buildReviveParty(['true_resurrection'], 24999);
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
    const stillDead = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(stillDead?.dead).toBe(true);
  });
});

describe('Reincarnate (L5, Druid)', () => {
  it('restores full HP and rolls a new species from the SRD table', async () => {
    // Force Math.random to 0 so d(9) maps to dragonborn (index 0).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = buildReviveParty(['reincarnate'], 1500, { species: 'human' });
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
    expect(revived?.dead).toBe(false);
    expect(revived?.hp).toBe(60);
    expect(revived?.species).toBe('dragonborn');
  });
});
