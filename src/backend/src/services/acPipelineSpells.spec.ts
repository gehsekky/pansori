// AC-buff spells — Mage Armor + Shield of Faith.
// Tests the AC pipeline: computeTotalAc honors the buff flags,
// cast handler sets them and recomputes target AC, concentration
// drop clears the SoF flag and recomputes.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { computeTotalAc } from './rulesEngine.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'AC Buff Test',
  ship_name: 'AC Buff Test',
  intro: '',
  seed_id: 'ac-buff',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

describe('computeTotalAc — buff flags', () => {
  it('unarmored baseline: 10 + DEX (DEX 14 → AC 12)', () => {
    const ac = computeTotalAc(14, null, null, [], [], false, false);
    expect(ac).toBe(12);
  });

  it('Mage Armor only (unarmored): 13 + DEX (DEX 14 → AC 15)', () => {
    const ac = computeTotalAc(14, null, null, [], [], true, false);
    expect(ac).toBe(15);
  });

  it('Shield of Faith only (unarmored): 10 + DEX + 2 (DEX 14 → AC 14)', () => {
    const ac = computeTotalAc(14, null, null, [], [], false, true);
    expect(ac).toBe(14);
  });

  it('Mage Armor + Shield of Faith (unarmored): 13 + DEX + 2 (DEX 14 → AC 17)', () => {
    const ac = computeTotalAc(14, null, null, [], [], true, true);
    expect(ac).toBe(17);
  });

  it('Mage Armor with armor equipped: no effect (only unarmored applies)', () => {
    const armor = {
      id: 'chain-mail',
      name: 'Chain Mail',
      type: 'armor' as const,
      slot: 'armor' as const,
      armorAcBase: 16,
      dexCapToAc: 0,
      damage: '',
      range: 'melee' as const,
      ac_bonus: null,
      heal: null,
      effect: null,
      weight: 55,
      desc: 'Heavy armor',
      aliases: [],
    };
    const inventory = [{ instance_id: 'armor-1', id: 'chain-mail', name: 'Chain Mail' }];
    const ac = computeTotalAc(14, 'armor-1', null, inventory, [armor], true, false);
    expect(ac).toBe(16); // unchanged by Mage Armor since wearing armor
  });
});

describe('Mage Armor — cast handler', () => {
  it('Wizard self-casts: mage_armor_active = true, AC recomputed', async () => {
    const wizard = makeChar({
      id: 'wizard-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      dex: 14,
      ac: 12, // 10 + DEX, unarmored baseline
      spells_known: ['mage_armor'],
      prepared_spells: ['mage_armor'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'wizard-1' }, { current_room: ctx.startRoomId }),
      characters: [wizard],
      active_character_id: 'wizard-1',
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'mage_armor', slotLevel: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.mage_armor_active).toBe(true);
    expect(after.ac).toBe(15); // 13 + DEX (2) = 15
  });
});

describe('Shield of Faith — cast handler + concentration drop', () => {
  it('Cleric self-casts: shield_of_faith_active = true, AC + 2, concentration started', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      dex: 12,
      ac: 11,
      spells_known: ['shield_of_faith'],
      prepared_spells: ['shield_of_faith'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: ctx.startRoomId }),
      characters: [cleric],
      active_character_id: 'cleric-1',
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'shield_of_faith', slotLevel: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.shield_of_faith_active).toBe(true);
    expect(after.ac).toBe(13); // baseline 11 + 2 from SoF
    expect(after.concentrating_on?.spellId).toBe('shield_of_faith');
  });

  it('breakConcentration clears shield_of_faith_active + recomputes AC', () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      dex: 12,
      ac: 13, // post-SoF
      shield_of_faith_active: true,
      concentrating_on: { spellId: 'shield_of_faith', rounds_left: 10 },
    });
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: ctx.startRoomId }),
      characters: [cleric],
      active_character_id: 'cleric-1',
    };
    const { char, st } = breakConcentration(cleric, state, ctx);
    expect(char.shield_of_faith_active).toBe(false);
    expect(char.ac).toBe(11); // back to baseline (10 + DEX 1)
    expect(char.concentrating_on).toBeNull();
    // Sanity: ally sweep didn't mangle anyone else.
    expect(st.characters).toHaveLength(1);
  });
});
