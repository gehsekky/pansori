// RE-2 — Fast Movement (SRD 5.2.1, Barbarian L5): your Speed increases by 10 ft
// while you aren't wearing Heavy armor. `effectiveSpeed` takes the loot table
// and reads the equipped armor's category, so light/medium-armored (and
// unarmored) barbarians get +10 while Heavy-armored ones don't.

import { describe, expect, it } from 'vitest';
import type { LootItem } from '../types.js';
import { effectiveSpeed } from './gameEngine.js';
import { makeChar } from '../test-fixtures.js';

const lootTable = [
  { id: 'plate', name: 'Plate', armorCategory: 'heavy' },
  { id: 'half-plate', name: 'Half Plate', armorCategory: 'medium' },
] as unknown as LootItem[];

const armoredBarb = (armorId: string) =>
  makeChar({
    character_class: 'Barbarian',
    level: 5,
    equipped_armor: 'a-1',
    inventory: [{ instance_id: 'a-1', id: armorId, name: armorId }],
  });

describe('Fast Movement — +10 ft Speed unless wearing Heavy armor (Barbarian L5)', () => {
  it('grants +10 ft to an unarmored Barbarian L5', () => {
    expect(effectiveSpeed(makeChar({ character_class: 'Barbarian', level: 5 }), lootTable)).toBe(
      40
    );
  });

  it('grants +10 ft in light/medium armor', () => {
    expect(effectiveSpeed(armoredBarb('half-plate'), lootTable)).toBe(40); // medium → still +10
  });

  it('denies the bonus in Heavy armor', () => {
    expect(effectiveSpeed(armoredBarb('plate'), lootTable)).toBe(30); // heavy → no bonus
  });

  it('is not yet online at L4', () => {
    expect(effectiveSpeed(makeChar({ character_class: 'Barbarian', level: 4 }), lootTable)).toBe(
      30
    );
  });

  it('does not apply to non-Barbarians', () => {
    expect(effectiveSpeed(makeChar({ character_class: 'Fighter', level: 20 }), lootTable)).toBe(30);
  });
});
