// RE-2 — Feral Instinct (SRD 5.2.1, Barbarian L7): Advantage on Initiative
// rolls. Applied in buildInitiativeOrder (the d20 becomes max of two rolls for
// a Barbarian L7+), beside the Alert feat's flat bonus.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../test-fixtures.js';
import { buildInitiativeOrder } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const rollOf = (char: ReturnType<typeof makeChar>) =>
  buildInitiativeOrder([char], []).find((e) => e.id === char.id)?.roll;

describe('Feral Instinct — Advantage on Initiative', () => {
  it('a Barbarian L7 takes the higher of two d20s', () => {
    mockRandom(0, 0.99); // d20s → 1 then 20; advantage keeps the 20
    const barb = makeChar({ id: 'b', character_class: 'Barbarian', level: 7, dex: 10 });
    expect(rollOf(barb)).toBe(20); // max(1, 20) + 0 DEX mod
  });

  it('a Barbarian L6 rolls a single d20 (feature not yet online)', () => {
    mockRandom(0, 0.99); // only the first d20 (1) is consumed
    const barb = makeChar({ id: 'b', character_class: 'Barbarian', level: 6, dex: 10 });
    expect(rollOf(barb)).toBe(1);
  });

  it('a non-Barbarian rolls a single d20', () => {
    mockRandom(0, 0.99);
    const fighter = makeChar({ id: 'f', character_class: 'Fighter', level: 7, dex: 10 });
    expect(rollOf(fighter)).toBe(1);
  });
});
