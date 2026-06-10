// Attunement tests — `handleAttune` (existing) cap + curse reveal +
// `handleDeAttune` (new) voluntary unbind + cursed-item resistance.

import type { Context, LootItem, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_ITEMS } from '../../../campaignData/srd/items.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

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
  lootTable: [...ctx.lootTable, cursedItem, ringItem, SRD_ITEMS.cloak_of_protection],
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
      // (the ring's slot is null in real SRD; this is just verifying
      // the unequip logic on de_attune).
      equipment: { main_hand: 'ring-1' },
    });
    const state = { ...makeState(), characters: [char], active_character_id: 'pc-1' };
    const result = await takeAction({
      action: { type: 'de_attune', instanceId: 'ring-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    expect(result.newState.characters[0].equipment.main_hand).toBeUndefined();
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

  it("drops a Cloak of Protection's +1 AC when de-attuning (and unequips it)", async () => {
    // Worn + attuned cloak: stored AC already includes its +1.
    const char = makeChar({
      id: 'pc-1',
      dex: 10, // mod 0 → unarmored base AC is exactly 10
      ac: 11, // base 10 + the cloak's worn +1
      inventory: [
        { instance_id: 'cloak-1', id: 'cloak_of_protection', name: 'Cloak of Protection' },
      ],
      equipment: { cloak: 'cloak-1' },
      attuned_items: ['cloak-1'],
    });
    const state = { ...makeState(), characters: [char], active_character_id: 'pc-1' };
    const result = await takeAction({
      action: { type: 'de_attune', instanceId: 'cloak-1' },
      history: [],
      state,
      seed: testSeed,
      context: testCtx,
    });
    const updated = result.newState.characters[0];
    expect(updated.attuned_items).not.toContain('cloak-1');
    expect(updated.equipment.cloak).toBeUndefined(); // implicitly unequipped
    expect(updated.ac).toBe(10); // the worn +1 fell off
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
