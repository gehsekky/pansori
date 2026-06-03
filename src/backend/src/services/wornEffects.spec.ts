import { activeWornEffects, wornSaveBonus } from './wornEffects.js';
import { describe, expect, it } from 'vitest';
import type { LootItem } from '../types.js';
import { makeChar } from '../test-fixtures.js';

// A worn item that grants +1 WIS saves and requires attunement (the Moonstone
// Amulet shape).
const amulet: LootItem = {
  id: 'moonstone_amulet',
  name: 'Moonstone Amulet',
  desc: '+1 to WIS saves.',
  weight: 2,
  type: 'misc',
  slot: 'neck',
  damage: null,
  ac_bonus: null,
  heal: null,
  effect: null,
  aliases: [],
  requiresAttunement: true,
  wornEffects: [{ kind: 'save_bonus', ability: 'wis', bonus: 1 }],
};

const lootTable = [amulet];
const inventory = [{ instance_id: 'amu-1', id: 'moonstone_amulet', name: 'Moonstone Amulet' }];

describe('worn effects — Moonstone Amulet (+1 WIS save)', () => {
  it('applies when the item is both worn and attuned', () => {
    const char = makeChar({
      inventory,
      equipment: { neck: 'amu-1' },
      attuned_items: ['amu-1'],
    });
    expect(wornSaveBonus(char, 'wis', lootTable)).toBe(1);
    expect(activeWornEffects(char, lootTable)).toHaveLength(1);
  });

  it('does NOT apply when worn but not attuned', () => {
    const char = makeChar({ inventory, equipment: { neck: 'amu-1' }, attuned_items: [] });
    expect(wornSaveBonus(char, 'wis', lootTable)).toBe(0);
  });

  it('does NOT apply when attuned but not worn', () => {
    const char = makeChar({ inventory, equipment: {}, attuned_items: ['amu-1'] });
    expect(wornSaveBonus(char, 'wis', lootTable)).toBe(0);
  });

  it('only affects the matching save ability', () => {
    const char = makeChar({ inventory, equipment: { neck: 'amu-1' }, attuned_items: ['amu-1'] });
    expect(wornSaveBonus(char, 'str', lootTable)).toBe(0);
    expect(wornSaveBonus(char, 'cha', lootTable)).toBe(0);
  });

  it('contributes nothing for a character wearing nothing', () => {
    const char = makeChar({ equipment: {} });
    expect(activeWornEffects(char, lootTable)).toEqual([]);
    expect(wornSaveBonus(char, 'wis', lootTable)).toBe(0);
  });

  it('stacks bonuses across multiple worn effects of the same ability', () => {
    const ring: LootItem = { ...amulet, id: 'wis_ring', slot: 'ring', requiresAttunement: false };
    const char = makeChar({
      inventory: [...inventory, { instance_id: 'ring-1', id: 'wis_ring', name: 'Ring of Insight' }],
      equipment: { neck: 'amu-1', ring_1: 'ring-1' },
      attuned_items: ['amu-1'],
    });
    // amulet (+1, worn+attuned) + ring (+1, worn, no attunement needed) = +2
    expect(wornSaveBonus(char, 'wis', [amulet, ring])).toBe(2);
  });
});
