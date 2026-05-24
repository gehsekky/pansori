// RE-2 — Roving (SRD 5.2.1, Ranger L6): your Speed increases by 10 ft while you
// aren't wearing Heavy armor (mirrors Barbarian Fast Movement). The Climb/Swim
// Speed = Speed half is deferred (no vertical/liquid traversal model).

import { describe, expect, it } from 'vitest';
import type { LootItem } from '../types.js';
import { effectiveSpeed } from './gameEngine.js';
import { makeChar } from '../test-fixtures.js';

const lootTable = [
  { id: 'plate', name: 'Plate', armorCategory: 'heavy' },
  { id: 'half-plate', name: 'Half Plate', armorCategory: 'medium' },
] as unknown as LootItem[];

const armoredRanger = (armorId: string) =>
  makeChar({
    character_class: 'Ranger',
    level: 6,
    equipped_armor: 'a-1',
    inventory: [{ instance_id: 'a-1', id: armorId, name: armorId }],
  });

describe('Roving — +10 ft Speed unless wearing Heavy armor (Ranger L6)', () => {
  it('grants +10 ft to an unarmored Ranger L6', () => {
    expect(effectiveSpeed(makeChar({ character_class: 'Ranger', level: 6 }), lootTable)).toBe(40);
  });

  it('grants +10 ft in medium armor but not Heavy', () => {
    expect(effectiveSpeed(armoredRanger('half-plate'), lootTable)).toBe(40);
    expect(effectiveSpeed(armoredRanger('plate'), lootTable)).toBe(30);
  });

  it('is not yet online at L5', () => {
    expect(effectiveSpeed(makeChar({ character_class: 'Ranger', level: 5 }), lootTable)).toBe(30);
  });

  it('stacks with Barbarian Fast Movement for a multiclass (distinct features)', () => {
    const multi = makeChar({
      character_class: 'Ranger',
      level: 11,
      class_levels: { ranger: 6, barbarian: 5 },
    });
    expect(effectiveSpeed(multi, lootTable)).toBe(50); // 30 + 10 (Roving) + 10 (Fast Movement)
  });
});
