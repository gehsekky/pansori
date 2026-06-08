// SRD 5.2.1 — Surprise. A Surprised combatant has DISADVANTAGE on its
// Initiative roll (the 2024 rule); it does NOT skip a turn. Applied in
// buildInitiativeOrder (the d20 becomes the min of two rolls), and it cancels
// with Feral Instinct's Advantage. The Alert feat grants immunity to Surprise.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import { buildInitiativeOrder } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const rollOf = (char: ReturnType<typeof makeChar>, surprised: boolean) =>
  buildInitiativeOrder([char], [], surprised ? new Set([char.id]) : new Set()).find(
    (e) => e.id === char.id
  )?.roll;

describe('Surprise — Disadvantage on Initiative (SRD 5.2.1)', () => {
  it('a surprised combatant takes the LOWER of two d20s', () => {
    mockRandom(0.99, 0); // d20s → 20 then 1; disadvantage keeps the 1
    const fighter = makeChar({ id: 'f', character_class: 'Fighter', level: 5, dex: 10 });
    expect(rollOf(fighter, true)).toBe(1); // min(20, 1) + 0 DEX mod
  });

  it('the same combatant unsurprised rolls a single d20 (the 20)', () => {
    mockRandom(0.99, 0);
    const fighter = makeChar({ id: 'f', character_class: 'Fighter', level: 5, dex: 10 });
    expect(rollOf(fighter, false)).toBe(20); // single roll, no second die drawn
  });

  it('Feral Instinct Advantage cancels Surprise Disadvantage → a single roll', () => {
    mockRandom(0, 0.99); // if two dice were drawn this would be max/min; cancel → one die (1)
    const barb = makeChar({ id: 'b', character_class: 'Barbarian', level: 7, dex: 10 });
    expect(rollOf(barb, true)).toBe(1);
  });

  it('the Alert feat is immune to Surprise — single roll + its prof bonus', () => {
    mockRandom(0, 0.99); // single die → 1
    const alert = makeChar({
      id: 'a',
      character_class: 'Fighter',
      level: 5,
      dex: 10,
      feats: ['alert'],
    });
    expect(rollOf(alert, true)).toBe(1 + 3); // d20 1 + Alert prof (+3 at L5), no disadvantage
  });
});
