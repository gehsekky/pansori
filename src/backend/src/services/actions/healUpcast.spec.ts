// Regression test for heal-spell upcast scaling.
//
// **Pre-existing bug:** the cast handler rolled `spell.heal`
// dice directly. The spell's `upcastBonus` field (e.g. Cure
// Wounds: `'2d8'`) was defined in spell data but never read by
// the heal path. Casting Cure Wounds with a level-2 slot
// consumed the slot but rolled only 2d8 + mod — same as a
// level-1 cast. Healing Word had the same bug.
//
// Fixed by mirroring the damage-spell upcast scaling: roll
// `addDice(spell.heal, multiplyDice(spell.upcastBonus,
// extraLevels))`. Cure Wounds slot-2 now rolls 4d8 + mod;
// slot-3 → 6d8 + mod; etc.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Heal Upcast Test',
  ship_name: 'Heal Upcast Test',
  intro: '',
  seed_id: 'heal-upcast',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildHealParty(slot: number, slotsMax: Record<number, number>) {
  const cleric = makeChar({
    id: 'cleric-1',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    spells_known: ['cure_wounds'],
    prepared_spells: ['cure_wounds'],
    spell_slots_max: slotsMax,
    spell_slots_used: {},
  });
  const wounded = makeChar({
    id: 'wounded-1',
    character_class: 'Fighter',
    hp: 1,
    max_hp: 100,
  });
  return {
    ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
    characters: [cleric, wounded],
    active_character_id: 'cleric-1',
    slot,
  };
}

describe('Heal spell upcast — slot scaling', () => {
  it('Cure Wounds at slot 1 rolls 2d8 + mod (baseline)', async () => {
    // Force max d8 = 8. random=0.99 → d8 → 8.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = buildHealParty(1, { 1: 1, 2: 1, 3: 1 });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const wounded = result.newState.characters.find((c) => c.id === 'wounded-1');
    // 2d8 maxed → 16 + WIS mod (+3) = 19 healed; wounded was at 1.
    expect(wounded?.hp).toBe(1 + 19);
  });

  it('Cure Wounds at slot 2 rolls 4d8 + mod (was 2d8 pre-fix)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = buildHealParty(2, { 1: 1, 2: 1, 3: 1 });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 2 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const wounded = result.newState.characters.find((c) => c.id === 'wounded-1');
    // 4d8 maxed → 32 + 3 = 35; wounded was at 1.
    expect(wounded?.hp).toBe(1 + 35);
  });

  it('Cure Wounds at slot 3 rolls 6d8 + mod', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = buildHealParty(3, { 1: 1, 2: 1, 3: 1 });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 3 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const wounded = result.newState.characters.find((c) => c.id === 'wounded-1');
    // 6d8 maxed → 48 + 3 = 51.
    expect(wounded?.hp).toBe(1 + 51);
  });
});
