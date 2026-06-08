// RE-3 — 2024 Exhaustion model: −2 to every D20 Test per level (folded into
// d20TestPenalty, which also carries the Raise Dead / Resurrection penalty) and
// −5 ft Speed per level (effectiveSpeed). No max-HP reduction; lethal at 6.

import { describe, expect, it } from 'vitest';
import { d20TestPenalty } from '../../src/services/rulesEngine.js';
import { effectiveSpeed } from '../../src/services/gameEngine.js';
import { makeChar } from '../../src/test-fixtures.js';

describe('d20TestPenalty — exhaustion + revive', () => {
  it('is −2 per Exhaustion level', () => {
    expect(d20TestPenalty({ exhaustion_level: 0 })).toBe(0);
    expect(d20TestPenalty({ exhaustion_level: 1 })).toBe(2);
    expect(d20TestPenalty({ exhaustion_level: 3 })).toBe(6);
  });

  it('stacks with the Raise Dead / Resurrection penalty', () => {
    expect(d20TestPenalty({ exhaustion_level: 2, revive_d20_penalty: 4 })).toBe(8);
  });
});

describe('effectiveSpeed — exhaustion speed reduction', () => {
  it('drops 5 ft per Exhaustion level, floored at 0', () => {
    expect(effectiveSpeed(makeChar({ speed: 30, exhaustion_level: 0 }))).toBe(30);
    expect(effectiveSpeed(makeChar({ speed: 30, exhaustion_level: 2 }))).toBe(20);
    expect(effectiveSpeed(makeChar({ speed: 30, exhaustion_level: 5 }))).toBe(5);
    // A high level can't drive Speed negative.
    expect(effectiveSpeed(makeChar({ speed: 30, exhaustion_level: 8 }))).toBe(0);
  });
});
