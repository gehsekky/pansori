// 2024 starting equipment — "Choose A/B/C" packages per class. resolveStartingEquipment
// picks the chosen package (items + GP), defaults to the first, and falls back
// to a legacy item list + 5 GP when a class has no packages.

import { SRD_CLASS_STARTING_EQUIPMENT, resolveStartingEquipment } from './classes.js';
import { describe, expect, it } from 'vitest';
import { SRD_ITEMS } from './items.js';

describe('SRD_CLASS_STARTING_EQUIPMENT', () => {
  it('every package item id exists in the item catalog', () => {
    for (const [cls, pkgs] of Object.entries(SRD_CLASS_STARTING_EQUIPMENT)) {
      for (const pkg of pkgs) {
        for (const id of pkg.items) {
          expect(SRD_ITEMS[id], `${cls} ${pkg.id} → ${id}`).toBeDefined();
        }
      }
    }
  });

  it('every class offers at least one package, each with positive gold', () => {
    for (const [cls, pkgs] of Object.entries(SRD_CLASS_STARTING_EQUIPMENT)) {
      expect(pkgs.length, cls).toBeGreaterThan(0);
      for (const pkg of pkgs) expect(pkg.gold, `${cls} ${pkg.id}`).toBeGreaterThan(0);
    }
  });

  it('Fighter has three packages (A/B/C); Wizard has two', () => {
    expect(SRD_CLASS_STARTING_EQUIPMENT.Fighter.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(SRD_CLASS_STARTING_EQUIPMENT.Wizard).toHaveLength(2);
  });
});

describe('resolveStartingEquipment', () => {
  const packages = SRD_CLASS_STARTING_EQUIPMENT.Fighter;

  it('returns the package matching the chosen id', () => {
    const c = resolveStartingEquipment(packages, 'C', []);
    expect(c.items).toEqual([]);
    expect(c.gold).toBe(155);
  });

  it('defaults to the first package when the id is omitted or unknown', () => {
    const def = resolveStartingEquipment(packages, undefined, []);
    expect(def).toEqual({ items: packages[0].items, gold: packages[0].gold });
    expect(resolveStartingEquipment(packages, 'Z', [])).toEqual(def); // unknown id → default
  });

  it('falls back to the legacy item list + 5 GP when there are no packages', () => {
    expect(resolveStartingEquipment(undefined, 'A', ['longsword', 'shield'])).toEqual({
      items: ['longsword', 'shield'],
      gold: 5,
    });
  });
});
