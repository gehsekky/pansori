import type { Character, GameState } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { applyDamage } from '../../services/damage.js';

afterEach(() => vi.restoreAllMocks());

// Damage-spec defaults: a 20-HP / AC-15 character so HP loss is
// visible and applyDamage scenarios fit within range. Delegate to the
// canonical `makeChar`; merge per-test overrides on top.
const fixtureChar = (overrides: Partial<Character> = {}): Character =>
  makeChar({ hp: 20, max_hp: 20, ac: 15, ...overrides });

const fixtureState = (char: Character): GameState =>
  makeState({}, { characters: [char], active_character_id: char.id });

describe('applyDamage — basics', () => {
  it('returns unchanged on zero damage', () => {
    const char = fixtureChar();
    const st = fixtureState(char);
    const result = applyDamage(char, st, 0);
    expect(result.amountDealt).toBe(0);
    expect(result.char.hp).toBe(20);
    expect(result.knockedOut).toBe(false);
  });

  it('returns unchanged on negative damage', () => {
    const char = fixtureChar();
    const st = fixtureState(char);
    const result = applyDamage(char, st, -5);
    expect(result.amountDealt).toBe(0);
    expect(result.char.hp).toBe(20);
  });

  it('subtracts HP', () => {
    const char = fixtureChar({ hp: 20 });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 7);
    expect(result.char.hp).toBe(13);
    expect(result.amountDealt).toBe(7);
    expect(result.knockedOut).toBe(false);
  });

  it('clamps HP at 0 and reports knockedOut', () => {
    const char = fixtureChar({ hp: 3 });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 50);
    expect(result.char.hp).toBe(0);
    expect(result.amountDealt).toBe(3); // only 3 HP available to lose
    expect(result.knockedOut).toBe(true);
  });

  it('does not report knockedOut when already at 0', () => {
    const char = fixtureChar({ hp: 0 });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 5);
    expect(result.char.hp).toBe(0);
    expect(result.knockedOut).toBe(false);
  });
});

describe('applyDamage — temp HP absorption', () => {
  it('temp HP absorbs damage first', () => {
    const char = fixtureChar({ hp: 20, temp_hp: 5 });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 3);
    expect(result.tempHpAbsorbed).toBe(3);
    expect(result.tempHpRemaining).toBe(2);
    expect(result.char.hp).toBe(20);
    expect(result.char.temp_hp).toBe(2);
    expect(result.amountDealt).toBe(0); // HP unchanged
  });

  it('damage that exceeds temp HP spills into HP', () => {
    const char = fixtureChar({ hp: 20, temp_hp: 5 });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 8);
    expect(result.tempHpAbsorbed).toBe(5);
    expect(result.tempHpRemaining).toBe(0);
    expect(result.char.hp).toBe(17); // 20 - (8-5)
    expect(result.amountDealt).toBe(3);
  });

  it('skipTempHp bypasses absorption', () => {
    const char = fixtureChar({ hp: 20, temp_hp: 5 });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 7, { skipTempHp: true });
    expect(result.tempHpAbsorbed).toBe(0);
    expect(result.char.hp).toBe(13);
    expect(result.char.temp_hp).toBe(5); // untouched
  });
});

describe('applyDamage — exhaustion (2024 model has no max-HP clamp)', () => {
  it('does not clamp HP at exhaustion level 4 (2024 has no HP-maximum reduction)', () => {
    // 2024 Exhaustion is −2/level on D20 Tests + −5 ft/level Speed, lethal at 6
    // — no max-HP halving. Damage 5 from 20 leaves 15 even at level 4.
    const char = fixtureChar({ hp: 20, max_hp: 20, exhaustion_level: 4 });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 5);
    expect(result.char.hp).toBe(15);
    expect(result.amountDealt).toBe(5);
  });
});

describe('applyDamage — concentration', () => {
  it('not concentrating → no save attempted (no concentrationNote)', () => {
    const char = fixtureChar({ hp: 20, concentrating_on: null });
    const st = fixtureState(char);
    const result = applyDamage(char, st, 10);
    expect(result.concentrationNote).toBe('');
    expect(result.concentrationBroken).toBe(false);
  });

  it('concentration held on successful CON save (nat-20)', () => {
    // 10 damage → DC max(10, 5) = 10. nat-20 d20 + 0 mod = 20 ≥ 10 → hold.
    const char = fixtureChar({
      hp: 20,
      con: 10,
      concentrating_on: { spellId: 'bless', rounds_left: 9 },
    });
    const st = fixtureState(char);
    mockRandom(0.999); // d20 → 20
    const result = applyDamage(char, st, 10);
    expect(result.concentrationBroken).toBe(false);
    expect(result.char.concentrating_on).toEqual({ spellId: 'bless', rounds_left: 9 });
    expect(result.concentrationNote).toContain('Concentration hold');
  });

  it('concentration broken on failed CON save', () => {
    // 10 damage → DC 10. d20 = 2 + 0 = 2 < 10 → break.
    const char = fixtureChar({
      hp: 20,
      con: 10,
      concentrating_on: { spellId: 'bless', rounds_left: 9 },
    });
    const st = fixtureState(char);
    mockRandom(0.05); // d20 → 2
    const result = applyDamage(char, st, 10);
    expect(result.concentrationBroken).toBe(true);
    expect(result.char.concentrating_on).toBeNull();
    expect(result.concentrationNote).toContain('Concentration broken');
    expect(result.concentrationNote).toContain('bless');
  });

  it('skipConcentration bypasses the save', () => {
    const char = fixtureChar({
      hp: 20,
      concentrating_on: { spellId: 'bless', rounds_left: 9 },
    });
    const st = fixtureState(char);
    // No mockRandom — if a roll happened, Math.random would return its
    // default value (non-deterministic). Concentration would still be checked.
    // skipConcentration prevents the call entirely.
    const result = applyDamage(char, st, 10, { skipConcentration: true });
    expect(result.concentrationBroken).toBe(false);
    expect(result.char.concentrating_on).toEqual({ spellId: 'bless', rounds_left: 9 });
    expect(result.concentrationNote).toBe('');
  });

  it('concentration check uses amountDealt, NOT raw — temp HP absorb does not trigger save', () => {
    // Temp HP fully absorbs damage → amountDealt is 0 → no save attempted.
    const char = fixtureChar({
      hp: 20,
      temp_hp: 10,
      concentrating_on: { spellId: 'bless', rounds_left: 9 },
    });
    const st = fixtureState(char);
    // No mockRandom — verifying no d20 roll happens by checking
    // concentrating_on remains intact and no note generated.
    const result = applyDamage(char, st, 5);
    expect(result.tempHpAbsorbed).toBe(5);
    expect(result.amountDealt).toBe(0);
    expect(result.concentrationNote).toBe('');
    expect(result.char.concentrating_on).toEqual({ spellId: 'bless', rounds_left: 9 });
  });

  it('Bless cleanup: breaking concentration on Bless clears blessed from allies', () => {
    // Two-PC party. PC-1 is the bless caster, PC-2 is blessed.
    const caster = fixtureChar({
      id: 'caster',
      hp: 20,
      con: 10,
      concentrating_on: { spellId: 'bless', rounds_left: 9 },
    });
    const ally = fixtureChar({
      id: 'ally',
      conditions: ['blessed'],
      condition_sources: { blessed: 'caster' },
    });
    const st = { ...fixtureState(caster), characters: [caster, ally] };
    mockRandom(0.05); // d20 → 2 → fail
    const result = applyDamage(caster, st, 10);
    expect(result.concentrationBroken).toBe(true);
    const allyAfter = result.st.characters.find((c) => c.id === 'ally')!;
    expect(allyAfter.conditions).not.toContain('blessed');
    expect(allyAfter.condition_sources?.blessed).toBeUndefined();
  });
});
