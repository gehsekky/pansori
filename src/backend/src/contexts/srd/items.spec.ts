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
import { context as vale } from '../vale_of_shadows.js';

describe('SRD_ITEMS catalog integrity', () => {
  it('every entry key matches its item id', () => {
    for (const [key, item] of Object.entries(SRD_ITEMS)) {
      expect(item.id).toBe(key);
    }
  });

  it('has the expected catalog size (21 weapons + 7 armor + 4 gear)', () => {
    expect(ALL_SRD_ITEM_IDS).toHaveLength(32);
    const weapons = Object.values(SRD_ITEMS).filter((i) => i.type === 'weapon');
    const armor = Object.values(SRD_ITEMS).filter((i) => i.type === 'armor');
    expect(weapons).toHaveLength(21);
    expect(armor).toHaveLength(7);
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
    ['vale_of_shadows', vale],
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
