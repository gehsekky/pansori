import {
  activeWornEffects,
  syncSetAbilities,
  wornAcBonus,
  wornLightRadius,
  wornSaveBonus,
} from '../../services/wornEffects.js';
import { describe, expect, it } from 'vitest';
import type { LootItem } from '../../types.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { makeChar } from '../../test-fixtures.js';

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

describe('worn light sources (Torch / Hooded Lantern)', () => {
  const torchLoot = [SRD_ITEMS.torch, SRD_ITEMS.hooded_lantern];

  it('an equipped Torch sheds a 20-ft bright radius', () => {
    const char = makeChar({
      inventory: [{ instance_id: 't-1', id: 'torch', name: 'Torch' }],
      equipment: { off_hand: 't-1' },
    });
    expect(wornLightRadius(char, torchLoot)).toBe(20);
  });

  it('an equipped Hooded Lantern sheds a 30-ft bright radius', () => {
    const char = makeChar({
      inventory: [{ instance_id: 'l-1', id: 'hooded_lantern', name: 'Hooded Lantern' }],
      equipment: { off_hand: 'l-1' },
    });
    expect(wornLightRadius(char, torchLoot)).toBe(30);
  });

  it('a torch carried but NOT equipped sheds no light', () => {
    const char = makeChar({
      inventory: [{ instance_id: 't-1', id: 'torch', name: 'Torch' }],
      equipment: {},
    });
    expect(wornLightRadius(char, torchLoot)).toBe(0);
  });

  it('no light source ⇒ 0', () => {
    expect(wornLightRadius(makeChar({ equipment: {} }), torchLoot)).toBe(0);
  });
});

describe('worn AC + all-saves — Cloak / Ring of Protection', () => {
  const loot = [SRD_ITEMS.cloak_of_protection, SRD_ITEMS.ring_of_protection];
  const cloakInv = { instance_id: 'cl-1', id: 'cloak_of_protection', name: 'Cloak of Protection' };
  const ringInv = { instance_id: 'rg-1', id: 'ring_of_protection', name: 'Ring of Protection' };

  it('a worn + attuned Cloak grants +1 AC and +1 to every save', () => {
    const char = makeChar({
      inventory: [cloakInv],
      equipment: { cloak: 'cl-1' },
      attuned_items: ['cl-1'],
    });
    expect(wornAcBonus(char, loot)).toBe(1);
    for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      expect(wornSaveBonus(char, ab, loot)).toBe(1);
    }
  });

  it('gives nothing while worn but not attuned (attunement gate)', () => {
    const char = makeChar({
      inventory: [cloakInv],
      equipment: { cloak: 'cl-1' },
      attuned_items: [],
    });
    expect(wornAcBonus(char, loot)).toBe(0);
    expect(wornSaveBonus(char, 'dex', loot)).toBe(0);
  });

  it('Cloak + Ring (different slots) stack to +2 AC and +2 saves', () => {
    const char = makeChar({
      inventory: [cloakInv, ringInv],
      equipment: { cloak: 'cl-1', ring_1: 'rg-1' },
      attuned_items: ['cl-1', 'rg-1'],
    });
    expect(wornAcBonus(char, loot)).toBe(2);
    expect(wornSaveBonus(char, 'wis', loot)).toBe(2);
  });

  it("an 'all' bonus stacks with an ability-specific one", () => {
    const amulet: LootItem = {
      id: 'moonstone_amulet',
      name: 'Moonstone Amulet',
      desc: '+1 WIS.',
      weight: 1,
      type: 'misc',
      slot: 'neck',
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: [],
      requiresAttunement: false,
      wornEffects: [{ kind: 'save_bonus', ability: 'wis', bonus: 1 }],
    };
    const char = makeChar({
      inventory: [
        cloakInv,
        { instance_id: 'am-1', id: 'moonstone_amulet', name: 'Moonstone Amulet' },
      ],
      equipment: { cloak: 'cl-1', neck: 'am-1' },
      attuned_items: ['cl-1'],
    });
    // WIS gets Cloak's all-saves +1 AND the amulet's +1; STR gets only the all +1.
    expect(wornSaveBonus(char, 'wis', [...loot, amulet])).toBe(2);
    expect(wornSaveBonus(char, 'str', [...loot, amulet])).toBe(1);
  });
});

describe('syncSetAbilities — stat-set wondrous items', () => {
  const healthLoot = [SRD_ITEMS.amulet_of_health];
  const amuletInv = { instance_id: 'a1', id: 'amulet_of_health', name: 'Amulet of Health' };
  // A level-5 PC wearing + attuned to the Amulet of Health.
  const wornHealth = (con: number, hp = 30, max_hp = 30) =>
    makeChar({
      con,
      hp,
      max_hp,
      level: 5,
      inventory: [amuletInv],
      equipment: { neck: 'a1' },
      attuned_items: ['a1'],
    });

  it('sets the score, stashes the base, and raises max HP for a CON change', () => {
    const c = wornHealth(14); // mod +2 → +4; Δ+2 × 5 levels = +10 HP
    syncSetAbilities(c, healthLoot);
    expect(c.con).toBe(19);
    expect(c.ability_set_base).toEqual({ con: 14 });
    expect(c.max_hp).toBe(40);
    expect(c.hp).toBe(40);
  });

  it('has no effect when the base score is already ≥ the item value', () => {
    const c = wornHealth(20);
    syncSetAbilities(c, healthLoot);
    expect(c.con).toBe(20);
    expect(c.ability_set_base).toBeUndefined();
    expect(c.max_hp).toBe(30);
  });

  it('does nothing while worn but not attuned (attunement gate)', () => {
    const c = makeChar({
      con: 14,
      level: 5,
      hp: 30,
      max_hp: 30,
      inventory: [amuletInv],
      equipment: { neck: 'a1' },
      attuned_items: [],
    });
    syncSetAbilities(c, healthLoot);
    expect(c.con).toBe(14);
    expect(c.ability_set_base).toBeUndefined();
    expect(c.max_hp).toBe(30);
  });

  it('is idempotent — a second sync with the item still worn changes nothing', () => {
    const c = wornHealth(14);
    syncSetAbilities(c, healthLoot);
    syncSetAbilities(c, healthLoot);
    expect(c.con).toBe(19);
    expect(c.max_hp).toBe(40);
    expect(c.hp).toBe(40);
    expect(c.ability_set_base).toEqual({ con: 14 });
  });

  it('restores the base score and unwinds the HP when the item comes off', () => {
    const c = wornHealth(14);
    syncSetAbilities(c, healthLoot); // con 19, max_hp 40, hp 40
    c.equipment = {}; // take the amulet off
    syncSetAbilities(c, healthLoot);
    expect(c.con).toBe(14);
    expect(c.ability_set_base).toBeUndefined();
    expect(c.max_hp).toBe(30);
    expect(c.hp).toBe(30);
  });

  it('takes the highest value when two items set the same ability (STR, no HP change)', () => {
    const loot = [SRD_ITEMS.gauntlets_of_ogre_power, SRD_ITEMS.belt_of_stone_giant_strength];
    const c = makeChar({
      str: 10,
      level: 5,
      hp: 30,
      max_hp: 30,
      inventory: [
        { instance_id: 'g', id: 'gauntlets_of_ogre_power', name: 'Gauntlets' },
        { instance_id: 'b', id: 'belt_of_stone_giant_strength', name: 'Belt' },
      ],
      equipment: { hands: 'g', waist: 'b' },
      attuned_items: ['g', 'b'],
    });
    syncSetAbilities(c, loot);
    expect(c.str).toBe(23); // belt's 23 beats the gauntlets' 19
    expect(c.ability_set_base).toEqual({ str: 10 });
    expect(c.max_hp).toBe(30); // STR doesn't touch HP
  });
});
