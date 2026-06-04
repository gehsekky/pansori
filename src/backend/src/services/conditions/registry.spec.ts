import {
  ADVANTAGE_CONDITIONS,
  CONDITIONS,
  DISADV_CONDITIONS,
  ENEMY_DISADV_CONDITIONS,
  PLAYER_ADV_CONDITIONS,
  applyExpiryHooks,
  autoFailsSave,
  blocksMovement,
  conditionGrantsAdvantageOnSelfAttacks,
  conditionGrantsAdvantageToAttackers,
  conditionImposesDisadvantageOnAttackers,
  conditionImposesDisadvantageOnSelfAttacks,
  disadvantageOnSave,
  getConditionDuration,
} from './registry.js';
import { describe, expect, it } from 'vitest';
import type { Character } from '../../types.js';
import { makeChar } from '../../test-fixtures.js';

// Registry tests only read `ac` and (for expiry hooks) other fields.
// Delegate to the canonical Character fixture; the override default of
// ac=15 here matches the pre-extraction value.
const fixtureChar = (overrides: Partial<Character> = {}): Character =>
  makeChar({ ac: 15, ...overrides });

describe('condition registry — duration', () => {
  it('returns the registered duration for known conditions', () => {
    expect(getConditionDuration('stunned')).toBe(1);
    expect(getConditionDuration('poisoned')).toBe(2);
    expect(getConditionDuration('frightened')).toBe(2);
    expect(getConditionDuration('invisible')).toBe(2);
  });

  it("marks unconscious and petrified as 'permanent'", () => {
    expect(getConditionDuration('unconscious')).toBe('permanent');
    expect(getConditionDuration('petrified')).toBe('permanent');
  });

  it('defaults unknown conditions to 1 round (matches pre-registry fallback)', () => {
    expect(getConditionDuration('made_up_condition')).toBe(1);
  });
});

describe('condition registry — advantage/disadvantage helpers', () => {
  it('paralyzed grants advantage to attackers', () => {
    expect(conditionGrantsAdvantageToAttackers(['paralyzed'])).toBe(true);
  });

  it('invisible imposes disadvantage on attackers AND grants advantage on self attacks', () => {
    expect(conditionImposesDisadvantageOnAttackers(['invisible'])).toBe(true);
    expect(conditionGrantsAdvantageOnSelfAttacks(['invisible'])).toBe(true);
  });

  it('poisoned imposes disadvantage on self attacks but not attackers', () => {
    expect(conditionImposesDisadvantageOnSelfAttacks(['poisoned'])).toBe(true);
    expect(conditionGrantsAdvantageToAttackers(['poisoned'])).toBe(false);
  });

  it('restrained grants advantage to attackers AND disadvantage on self attacks', () => {
    expect(conditionGrantsAdvantageToAttackers(['restrained'])).toBe(true);
    expect(conditionImposesDisadvantageOnSelfAttacks(['restrained'])).toBe(true);
  });
});

describe('condition registry — save modifiers', () => {
  it('paralyzed/stunned/unconscious/petrified auto-fail STR and DEX saves', () => {
    for (const c of ['paralyzed', 'stunned', 'unconscious', 'petrified']) {
      expect(autoFailsSave([c], 'str')).toBe(true);
      expect(autoFailsSave([c], 'dex')).toBe(true);
    }
  });

  it('auto-fail conditions do NOT touch CON / INT / WIS / CHA saves', () => {
    for (const ability of ['con', 'int', 'wis', 'cha'] as const) {
      expect(autoFailsSave(['paralyzed', 'stunned', 'unconscious', 'petrified'], ability)).toBe(
        false
      );
    }
  });

  it('restrained imposes disadvantage on DEX saves only', () => {
    expect(disadvantageOnSave(['restrained'], 'dex')).toBe(true);
    expect(disadvantageOnSave(['restrained'], 'str')).toBe(false);
  });
});

describe('condition registry — movement', () => {
  it('grappled and restrained block movement', () => {
    expect(blocksMovement(['grappled'])).toBe(true);
    expect(blocksMovement(['restrained'])).toBe(true);
  });

  it('paralyzed and stunned also block movement', () => {
    expect(blocksMovement(['paralyzed'])).toBe(true);
    expect(blocksMovement(['stunned'])).toBe(true);
  });

  it('non-movement conditions do not block', () => {
    expect(blocksMovement(['poisoned'])).toBe(false);
    expect(blocksMovement(['frightened'])).toBe(false);
    expect(blocksMovement(['invisible'])).toBe(false);
  });
});

describe('condition registry — on-expire hooks', () => {
  it('shield_spell expiry reverses the +5 AC bump', () => {
    const char = fixtureChar({ ac: 20 }); // cast Shield → AC 15 + 5
    const after = applyExpiryHooks(char, ['shield_spell']);
    expect(after.ac).toBe(15);
  });

  it('expiring multiple conditions runs each hook (and is no-op for hookless ones)', () => {
    const char = fixtureChar({ ac: 20 });
    const after = applyExpiryHooks(char, ['stunned', 'shield_spell', 'poisoned']);
    expect(after.ac).toBe(15); // only shield_spell touches AC
  });

  it('no expired conditions → no-op', () => {
    const char = fixtureChar({ ac: 15 });
    expect(applyExpiryHooks(char, [])).toEqual(char);
  });
});

describe('condition registry — derived Sets (compat shim)', () => {
  it('ADVANTAGE_CONDITIONS = pre-registry membership + Petrified', () => {
    // Petrified grants attackers Advantage per SRD (the pre-registry set omitted
    // it — a gap closed in the condition-fidelity pass).
    expect([...ADVANTAGE_CONDITIONS].sort()).toEqual(
      ['blinded', 'paralyzed', 'petrified', 'prone', 'restrained', 'stunned'].sort()
    );
  });

  it('DISADV_CONDITIONS — self-attack-disadvantage conditions (+ cursed / heat_seared / enfeebled)', () => {
    expect([...DISADV_CONDITIONS].sort()).toEqual(
      [
        'blinded',
        'cursed',
        'enfeebled',
        'frightened',
        'heat_seared',
        'poisoned',
        'prone',
        'restrained',
      ].sort()
    );
  });

  it('PLAYER_ADV_CONDITIONS = {invisible}; ENEMY_DISADV_CONDITIONS = {invisible, blurred, holy_warded}', () => {
    // Blur added `blurred` and Holy Aura added `holy_warded` (attackers have
    // Disadvantage) alongside Invisible.
    expect([...PLAYER_ADV_CONDITIONS]).toEqual(['invisible']);
    expect([...ENEMY_DISADV_CONDITIONS].sort()).toEqual(
      ['blurred', 'holy_warded', 'invisible'].sort()
    );
  });
});

describe('condition registry — completeness', () => {
  it('every condition in CONDITION_DURATION pre-registry has a registry entry', () => {
    // The pre-registry dict (now removed) declared durations for these.
    // Registry must keep parity so inflictCondition produces identical state.
    const preRegistryDurationKeys = [
      'stunned',
      'paralyzed',
      'poisoned',
      'prone',
      'frightened',
      'blinded',
      'restrained',
      'incapacitated',
      'grappled',
      'invisible',
    ];
    for (const id of preRegistryDurationKeys) {
      expect(CONDITIONS[id]).toBeDefined();
    }
  });
});
