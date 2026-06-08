// RE-2 — Danger Sense (SRD 5.2.1, Barbarian L2): Advantage on Dexterity saving
// throws unless Incapacitated. Wired into the DEX-save sites — on-hit condition
// saves (conditionSavingThrow), lair-AoE saves, and enemy damage-spell saves
// (resolveEnemySpell, covered here).

import type { Enemy, GameState, Spell } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import { hasDangerSense } from '../../services/multiclass.js';
import { resolveEnemySpell } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('hasDangerSense', () => {
  it('is granted at Barbarian L2, not L1', () => {
    expect(hasDangerSense(makeChar({ character_class: 'Barbarian', level: 2 }))).toBe(true);
    expect(hasDangerSense(makeChar({ character_class: 'Barbarian', level: 1 }))).toBe(false);
  });

  it('is false for non-Barbarians and while incapacitated', () => {
    expect(hasDangerSense(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
    expect(
      hasDangerSense(makeChar({ character_class: 'Barbarian', level: 5, conditions: ['stunned'] }))
    ).toBe(false);
  });
});

// DEX save-or-negate spell, flat 10 damage (no damage-roll RNG) so only the
// save consumes Math.random.
const blast = {
  id: 'blast',
  name: 'Fire Wave',
  damage: '10',
  savingThrow: 'dex',
  saveEffect: 'negates',
  damageType: 'fire',
} as unknown as Spell;
const mage = { id: 'mage', name: 'Mage', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;
const stFor = (c: ReturnType<typeof makeChar>) =>
  ({ characters: [c], entities: [] }) as unknown as GameState;
const barb = (level: number) =>
  makeChar({ id: 'b', character_class: 'Barbarian', level, dex: 10, hp: 30, max_hp: 30 });

describe('resolveEnemySpell — Danger Sense Advantage on a DEX save', () => {
  it('a Barbarian L2 takes the higher of two d20s and saves', () => {
    mockRandom(0, 0.99); // d20s → 1 then 20; advantage keeps 20 → 20 ≥ DC 14 → saves
    const r = resolveEnemySpell({
      enemy: mage,
      spell: blast,
      target: barb(2),
      st: stFor(barb(2)),
      narrative: '',
    });
    expect(r.target.hp).toBe(30); // negated → 0 damage
  });

  it('a Barbarian L1 rolls a single d20 and fails on the same rolls (control)', () => {
    mockRandom(0, 0.99); // single d20 → 1 → 1 < DC 14 → fails
    const r = resolveEnemySpell({
      enemy: mage,
      spell: blast,
      target: barb(1),
      st: stFor(barb(1)),
      narrative: '',
    });
    expect(r.target.hp).toBe(20); // failed → full 10
  });
});
