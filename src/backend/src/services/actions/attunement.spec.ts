// Attunement tests — `handleAttune` (existing) cap + curse reveal +
// `handleDeAttune` (new) voluntary unbind + cursed-item resistance.

import type { Context, LootItem, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Local context override that adds a `ring_of_protection_plus_1`
// (requires attunement) and a `cursed_blade` (requires attunement +
// cursed) to the loot table. Keeps the test self-contained without
// polluting the shared sandbox context.
const cursedItem: LootItem = {
  id: 'cursed_blade',
  name: 'Cursed Blade',
  desc: 'A wicked-looking shortsword that hums softly when drawn.',
  weight: 2,
  type: 'weapon',
  slot: 'weapon',
  damage: '1d6',
  ac_bonus: null,
  heal: null,
  effect: null,
  aliases: ['cursed blade'],
  requiresAttunement: true,
  cursed: true,
  curseDesc: 'You feel the blade refuse to leave your grip — it will not let you go.',
};

const ringItem: LootItem = {
  id: 'ring_of_protection_plus_1',
  name: 'Ring of Protection +1',
  desc: 'A modest silver band that grants protection.',
  weight: 0,
  type: 'misc',
  slot: null,
  damage: null,
  ac_bonus: 1,
  heal: null,
  effect: null,
  aliases: ['ring of protection'],
  requiresAttunement: true,
};

const testCtx: Context = {
  ...ctx,
  lootTable: [...ctx.lootTable, cursedItem, ringItem],
};

const testSeed: Seed = {
  context_id: testCtx.id,
  world_name: 'Attune Test',
  ship_name: 'Attune Test',
  intro: '',
  seed_id: 'attune-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('attune — cursed item reveal', () => {
  it('reveals curse text in narrative when attuning to a cursed item', async () => {
    const char = makeChar({
      id: 'pc-1',
      inventory: [{ instance_id: 'cb-1', id: 'cursed_blade', name: 'Cursed Blade' }],
    });
    const state = { ...makeState(), characters: [char], active_character_id: 'pc-1' };
    const result = await takeAction({
      action: { type: 'attune', instanceId: 'cb-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    expect(result.narrative).toMatch(/Curse revealed/);
    expect(result.narrative).toMatch(/refuse to leave your grip/);
    expect(result.newState.characters[0].attuned_items).toContain('cb-1');
  });
});

describe('de_attune — voluntary unbind', () => {
  it('removes the item from attuned_items when un-cursed', async () => {
    const char = makeChar({
      id: 'pc-1',
      inventory: [
        { instance_id: 'ring-1', id: 'ring_of_protection_plus_1', name: 'Ring of Protection +1' },
      ],
      attuned_items: ['ring-1'],
    });
    const state = { ...makeState(), characters: [char], active_character_id: 'pc-1' };
    const result = await takeAction({
      action: { type: 'de_attune', instanceId: 'ring-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    expect(result.newState.characters[0].attuned_items).not.toContain('ring-1');
    expect(result.narrative).toMatch(/release your attunement/);
  });

  it('refuses de-attunement of a cursed item', async () => {
    const char = makeChar({
      id: 'pc-1',
      inventory: [{ instance_id: 'cb-1', id: 'cursed_blade', name: 'Cursed Blade' }],
      attuned_items: ['cb-1'],
    });
    const state = { ...makeState(), characters: [char], active_character_id: 'pc-1' };
    const result = await takeAction({
      action: { type: 'de_attune', instanceId: 'cb-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    expect(result.narrative).toMatch(/curse on the Cursed Blade prevents/);
    expect(result.newState.characters[0].attuned_items).toContain('cb-1');
  });

  it('implicitly unequips an attunement-required item when de-attuning', async () => {
    const char = makeChar({
      id: 'pc-1',
      inventory: [
        { instance_id: 'ring-1', id: 'ring_of_protection_plus_1', name: 'Ring of Protection +1' },
      ],
      attuned_items: ['ring-1'],
      // Stash the ring as if equipped in the weapon slot for the test
      // (the ring's slot is null in real PHB; this is just verifying
      // the unequip logic on de_attune).
      equipped_weapon: 'ring-1',
    });
    const state = { ...makeState(), characters: [char], active_character_id: 'pc-1' };
    const result = await takeAction({
      action: { type: 'de_attune', instanceId: 'ring-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    expect(result.newState.characters[0].equipped_weapon).toBeNull();
  });

  it('rejects de-attunement during combat', async () => {
    const char = makeChar({
      id: 'pc-1',
      inventory: [
        { instance_id: 'ring-1', id: 'ring_of_protection_plus_1', name: 'Ring of Protection +1' },
      ],
      attuned_items: ['ring-1'],
    });
    const state = {
      ...makeState({}, { combat_active: true }),
      characters: [char],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'de_attune', instanceId: 'ring-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    expect(result.narrative).toMatch(/cannot end attunement during combat/);
    expect(result.newState.characters[0].attuned_items).toContain('ring-1');
  });

  it('rejects de-attunement of an item not attuned', async () => {
    const char = makeChar({
      id: 'pc-1',
      inventory: [
        { instance_id: 'ring-1', id: 'ring_of_protection_plus_1', name: 'Ring of Protection +1' },
      ],
      attuned_items: [],
    });
    const state = { ...makeState(), characters: [char], active_character_id: 'pc-1' };
    const result = await takeAction({
      action: { type: 'de_attune', instanceId: 'ring-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    expect(result.narrative).toMatch(/not attuned/);
  });
});
