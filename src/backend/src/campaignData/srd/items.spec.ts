// Shared SRD items resource — integrity + no-drift regression.
//
// The whole point of SRD_ITEMS is that every campaign shares ONE canonical
// definition per SRD item. These tests lock that invariant: the catalog is
// self-consistent, `srdItems` selects/guards correctly, and each shipped
// context's SRD-id loot entries are the exact shared objects (so a future
// re-inlined, drifted copy fails CI).

import { ALL_SRD_ITEM_IDS, SRD_ITEMS, srdItems } from './items.js';
import { describe, expect, it } from 'vitest';
import { context as sandbox } from '../sandbox.js';
import { context as vale } from '../malgovia/index.js';

describe('SRD_ITEMS catalog integrity', () => {
  it('every entry key matches its item id', () => {
    for (const [key, item] of Object.entries(SRD_ITEMS)) {
      expect(item.id).toBe(key);
    }
  });

  it('has the expected catalog size (38 weapons + 13 armor + 28 gear)', () => {
    // Full SRD 5.2.1 weapon + armor tables (incl. firearms: Musket, Pistol),
    // plus consumable/misc gear, tools, foci, and light sources.
    expect(ALL_SRD_ITEM_IDS).toHaveLength(79);
    const weapons = Object.values(SRD_ITEMS).filter((i) => i.type === 'weapon');
    const armor = Object.values(SRD_ITEMS).filter((i) => i.type === 'armor');
    const gear = Object.values(SRD_ITEMS).filter(
      (i) => i.type === 'misc' || i.type === 'consumable'
    );
    expect(weapons).toHaveLength(38);
    expect(armor).toHaveLength(13);
    expect(gear).toHaveLength(28);
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
  const contexts = [
    ['sandbox', sandbox],
    ['malgovia', vale],
  ] as const;

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
