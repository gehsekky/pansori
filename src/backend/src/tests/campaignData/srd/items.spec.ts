// Shared SRD items resource — integrity + no-drift regression.
//
// The whole point of SRD_ITEMS is that every campaign shares ONE canonical
// definition per SRD item. These tests lock that invariant: the catalog is
// self-consistent, `srdItems` selects/guards correctly, and each shipped
// context's SRD-id loot entries are the exact shared objects (so a future
// re-inlined, drifted copy fails CI).

import { ALL_SRD_ITEM_IDS, SRD_ITEMS, srdItems } from '../../../campaignData/srd/items.js';
import { describe, expect, it } from 'vitest';
import { context as sandbox } from '../../fixtures/testContext.js';

describe('SRD_ITEMS catalog integrity', () => {
  it('every entry key matches its item id', () => {
    for (const [key, item] of Object.entries(SRD_ITEMS)) {
      expect(item.id).toBe(key);
    }
  });

  it('has the expected catalog size (45 weapons + 20 armor + 49 gear)', () => {
    // Full SRD 5.2.1 weapon + armor tables (incl. firearms: Musket, Pistol),
    // plus consumable/misc gear, tools, foci, light sources, thrown splash
    // weapons, ammunition (arrows / bolts / bullets / needles), and magic items
    // (Cloak / Ring of Protection, the Healing Potion ladder, the stat-set
    // wondrous items, and the +N magic weapons/armor/shields). Counts include
    // the 7 magic weapons (weapon type) and 7 magic armor/shields (armor type).
    expect(ALL_SRD_ITEM_IDS).toHaveLength(114);
    const weapons = Object.values(SRD_ITEMS).filter((i) => i.type === 'weapon');
    const armor = Object.values(SRD_ITEMS).filter((i) => i.type === 'armor');
    const gear = Object.values(SRD_ITEMS).filter(
      (i) => i.type === 'misc' || i.type === 'consumable'
    );
    expect(weapons).toHaveLength(45); // 38 base + 7 magic
    expect(armor).toHaveLength(20); // 13 base + 7 magic (incl. shields)
    expect(gear).toHaveLength(49);
  });

  it('covers the full SRD 5.2.1 weapon + armor tables', () => {
    // prettier-ignore
    const expectedWeapons = [
      // Simple melee
      'club', 'dagger', 'greatclub', 'handaxe', 'javelin', 'light_hammer', 'mace',
      'quarterstaff', 'sickle', 'spear',
      // Simple ranged
      'dart', 'light_crossbow', 'shortbow', 'sling',
      // Martial melee
      'battleaxe', 'flail', 'glaive', 'greataxe', 'greatsword', 'halberd', 'lance',
      'longsword', 'maul', 'morningstar', 'pike', 'rapier', 'scimitar', 'shortsword',
      'trident', 'warhammer', 'war_pick', 'whip',
      // Martial ranged (incl. firearms)
      'blowgun', 'hand_crossbow', 'heavy_crossbow', 'longbow', 'musket', 'pistol',
    ];
    // prettier-ignore
    const expectedArmor = [
      'padded_armor', 'leather_armor', 'studded_leather', // light
      'hide_armor', 'chain_shirt', 'scale_mail', 'breastplate', 'half_plate', // medium
      'ring_mail', 'chain_mail', 'splint_armor', 'plate_armor', // heavy
      'shield',
    ];
    for (const id of [...expectedWeapons, ...expectedArmor]) {
      expect(SRD_ITEMS[id], `missing SRD item ${id}`).toBeTruthy();
    }
    expect(expectedWeapons).toHaveLength(38);
    expect(expectedArmor).toHaveLength(13);
  });

  it('Dart carries its SRD Vex mastery', () => {
    expect(SRD_ITEMS.dart.mastery).toBe('vex');
  });

  it('weapons declare damage + weaponType; armor declares a category', () => {
    for (const item of Object.values(SRD_ITEMS)) {
      if (item.type === 'weapon') {
        expect(item.damage, `${item.id} damage`).toBeTruthy();
        expect(item.weaponType, `${item.id} weaponType`).toBeTruthy();
      }
      if (item.type === 'armor') {
        expect(item.armorCategory, `${item.id} armorCategory`).toBeTruthy();
      }
    }
  });

  it('Cloak / Ring of Protection are attuned wondrous items with +1 AC and +1 all-saves', () => {
    for (const id of ['cloak_of_protection', 'ring_of_protection'] as const) {
      const item = SRD_ITEMS[id];
      expect(item.requiresAttunement, `${id} requiresAttunement`).toBe(true);
      expect(item.wornEffects).toEqual([
        { kind: 'ac_bonus', bonus: 1 },
        { kind: 'save_bonus', ability: 'all', bonus: 1 },
      ]);
    }
    // Different body slots, so the two stack.
    expect(SRD_ITEMS.cloak_of_protection.slot).toBe('cloak');
    expect(SRD_ITEMS.ring_of_protection.slot).toBe('ring');
  });

  it('stat-set wondrous items are attuned and carry the right set_ability effect', () => {
    const expected: Record<string, [string, number]> = {
      amulet_of_health: ['con', 19],
      gauntlets_of_ogre_power: ['str', 19],
      headband_of_intellect: ['int', 19],
      belt_of_hill_giant_strength: ['str', 21],
      belt_of_stone_giant_strength: ['str', 23],
      belt_of_fire_giant_strength: ['str', 25],
      belt_of_cloud_giant_strength: ['str', 27],
      belt_of_storm_giant_strength: ['str', 29],
    };
    for (const [id, [ability, value]] of Object.entries(expected)) {
      const item = SRD_ITEMS[id];
      expect(item.requiresAttunement, `${id} requiresAttunement`).toBe(true);
      expect(item.wornEffects, `${id} wornEffects`).toEqual([
        { kind: 'set_ability', ability, value },
      ]);
    }
  });

  it('+N magic weapons clone the base weapon and stamp magicBonus', () => {
    const ls2 = SRD_ITEMS.longsword_plus_2;
    expect(ls2.magicBonus).toBe(2);
    expect(ls2.type).toBe('weapon');
    // Base stats carry through unchanged (no drift).
    expect(ls2.damage).toBe(SRD_ITEMS.longsword.damage);
    expect(ls2.mastery).toBe(SRD_ITEMS.longsword.mastery);
    expect(ls2.versatileDamage).toBe(SRD_ITEMS.longsword.versatileDamage);
    expect(ls2.requiresAttunement).toBeUndefined(); // generic +N: no attunement
    expect(SRD_ITEMS.dagger_plus_1.magicBonus).toBe(1);
  });

  it('+N magic armor / shields carry the AC bonus on top of the base', () => {
    expect(SRD_ITEMS.plate_armor_plus_1.magicBonus).toBe(1);
    expect(SRD_ITEMS.plate_armor_plus_1.armorAcBase).toBe(SRD_ITEMS.plate_armor.armorAcBase);
    // A magic shield keeps its normal +2 ac_bonus AND adds magicBonus.
    expect(SRD_ITEMS.shield_plus_1.ac_bonus).toBe(2);
    expect(SRD_ITEMS.shield_plus_1.magicBonus).toBe(1);
    expect(SRD_ITEMS.shield_plus_3.magicBonus).toBe(3);
  });

  it('the Healing Potion ladder carries the SRD heal dice', () => {
    expect(SRD_ITEMS.healing_potion.heal).toBe('2d4+2');
    expect(SRD_ITEMS.greater_healing_potion.heal).toBe('4d4+4');
    expect(SRD_ITEMS.superior_healing_potion.heal).toBe('8d4+8');
    expect(SRD_ITEMS.supreme_healing_potion.heal).toBe('10d4+20');
  });
});

describe('srdItems selector', () => {
  it('returns the canonical objects in the requested order', () => {
    const picked = srdItems('shield', 'dagger');
    expect(picked).toHaveLength(2);
    expect(picked[0]).toBe(SRD_ITEMS.shield);
    expect(picked[1]).toBe(SRD_ITEMS.dagger);
  });

  it('throws on an unknown id (catches typos / removed items at load)', () => {
    expect(() => srdItems('dagger', 'vorpal_sword')).toThrow(/unknown SRD item id "vorpal_sword"/);
  });
});

describe('no drift — shipped contexts reuse the canonical SRD definitions', () => {
  const contexts = [['sandbox', sandbox]] as const;

  for (const [name, ctx] of contexts) {
    it(`${name}: each SRD-id loot entry is the shared object`, () => {
      for (const item of ctx.lootTable) {
        if (item.id in SRD_ITEMS) {
          // Same reference → no per-campaign copy that could drift.
          expect(item, `${name} item ${item.id}`).toBe(SRD_ITEMS[item.id]);
        }
      }
    });

    it(`${name}: has no duplicate item ids`, () => {
      const ids = ctx.lootTable.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
});

describe('SRD Equipment values', () => {
  it('every catalog item carries a purchase value (cr ≈ GP, sub-GP rounded to 1)', () => {
    for (const item of Object.values(SRD_ITEMS)) {
      expect(item.value, `${item.id} needs a value`).toBeGreaterThanOrEqual(1);
    }
  });

  it('spot-checks canonical SRD prices', () => {
    expect(SRD_ITEMS.dagger.value).toBe(2);
    expect(SRD_ITEMS.plate_armor.value).toBe(1500); // the SRD crafting example
    expect(SRD_ITEMS.heavy_crossbow.value).toBe(50); // the SRD time example
    expect(SRD_ITEMS.healing_potion.value).toBe(50);
    expect(SRD_ITEMS.longbow.value).toBe(50);
    expect(SRD_ITEMS.torch.value).toBe(1); // 1 CP rounded up to 1 cr
  });
});
