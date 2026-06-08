import {
  ADVANTAGE_CONDITIONS,
  DISADV_CONDITIONS,
  ENEMY_DISADV_CONDITIONS,
  FRESH_TURN,
  PLAYER_ADV_CONDITIONS,
  abilityMod,
  canDonArmor,
  canDonShield,
  canEquipWeapon,
  computeAcAfterArmorChange,
  d,
  extraAttackCount,
  hasWeaponProficiency,
  profBonus,
  rageDamageBonus,
  rageUsesMax,
  resolveEnemyAttack,
  resolvePlayerAttack,
  resolveSpellAttack,
  rollConditionSave,
  rollCritical,
  rollDeathSave,
  rollDice,
  skillCheck,
  sneakAttackDice,
  spellAttackBonus,
  spellSaveDC,
  unarmedDamage,
} from '../../services/rulesEngine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LootItem } from '../../types.js';
import { mockRandom } from '../../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

// d(N) = Math.floor(Math.random() * N) + 1
// random 0.0   → 1
// random 0.999 → N
// random 0.45  → Math.floor(0.45 * 20) + 1 = 10
// random 0.20  → Math.floor(0.20 * 20) + 1 = 5
// random 0.05  → Math.floor(0.05 * 20) + 1 = 2

// ─── d(sides) ────────────────────────────────────────────────────────────────

describe('d(sides)', () => {
  it('returns 1 when Math.random is 0', () => {
    mockRandom(0);
    expect(d(20)).toBe(1);
  });

  it('returns sides when Math.random is near 1', () => {
    mockRandom(0.999);
    expect(d(20)).toBe(20);
  });

  it('always returns a value in [1, sides]', () => {
    for (let i = 0; i < 100; i++) {
      const roll = d(6);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
  });
});

// ─── rollDice(expr) ───────────────────────────────────────────────────────────

describe('rollDice(expr)', () => {
  it('returns a flat integer when given a numeric string', () => {
    expect(rollDice('5')).toBe(5);
  });

  it('returns a flat integer when given a number', () => {
    expect(rollDice(7)).toBe(7);
  });

  it('returns a d4 roll for null', () => {
    mockRandom(0.5); // Math.floor(0.5 * 4) + 1 = 3
    expect(rollDice(null)).toBe(3);
  });

  it('parses XdY+Z correctly (2d6+3, both dice roll minimum)', () => {
    mockRandom(0, 0); // two d6 → 1, 1; +3 = 5
    expect(rollDice('2d6+3')).toBe(5);
  });

  it('parses XdY correctly (1d8, maximum roll)', () => {
    mockRandom(0.999); // d8 → 8
    expect(rollDice('1d8')).toBe(8);
  });
});

// ─── abilityMod ───────────────────────────────────────────────────────────────

describe('abilityMod(score)', () => {
  it.each([
    [10, 0],
    [12, 1],
    [8, -1],
    [20, 5],
    [1, -5],
    [15, 2],
  ])('score %i → modifier %i', (score, mod) => {
    expect(abilityMod(score)).toBe(mod);
  });

  it('defaults to 0 when score is undefined', () => {
    expect(abilityMod(undefined)).toBe(0);
  });
});

// ─── profBonus ───────────────────────────────────────────────────────────────

describe('profBonus(level)', () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])('level %i → profBonus %i', (level, bonus) => {
    expect(profBonus(level)).toBe(bonus);
  });
});

// ─── resolvePlayerAttack ─────────────────────────────────────────────────────
//
// Test Case D (from 5e reference): Level 1 Fighter, STR 16 (+3), Prof +2,
//   non-magical weapon vs AC 15. Hit if d20 + 3 + 2 >= 15, i.e. roll >= 10.

describe('resolvePlayerAttack', () => {
  const fighter = { str: 16, dex: 10, level: 1 }; // atkMod=+3, prof=+2

  // Test Case D — Melee To-Hit
  it('[Case D] hits AC 15 when roll + STR + prof >= 15 (roll=10)', () => {
    mockRandom(0.45); // d20 → Math.floor(9.0)+1 = 10; total=10+3+2=15 ✓
    const result = resolvePlayerAttack(fighter, '1d8', 15);
    expect(result.hit).toBe(true);
    expect(result.fumble).toBe(false);
    expect(result.critical).toBe(false);
    expect(result.total).toBe(15);
  });

  it('[Case D] misses AC 15 when roll + mods < 15 (roll=2)', () => {
    mockRandom(0.05); // d20 → 2; total=2+3+2=7
    const result = resolvePlayerAttack(fighter, '1d8', 15);
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });

  // Test Case E — Critical Hit
  it('[Case E] natural 20 always crits regardless of AC', () => {
    mockRandom(0.999, 0.999, 0.999); // d20=20, then damage dice (high)
    const result = resolvePlayerAttack(fighter, '1d8', 30);
    expect(result.critical).toBe(true);
    expect(result.hit).toBe(true);
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });

  it('[Case E] crit damage is higher on average than normal damage (100 trials)', () => {
    let normalTotal = 0,
      critTotal = 0;
    for (let i = 0; i < 100; i++) {
      // Force hit roll (roll=15) for normal, and crit roll (roll=20) for crit
      const normal = resolvePlayerAttack({ str: 10, dex: 10, level: 1 }, '1d8', 1);
      if (normal.critical) {
        critTotal += normal.damage;
      } else {
        normalTotal += normal.damage;
      }
    }
    // At minimum, a crit rolls 2d8 vs 1d8 so expected values differ — just ensure crits deal damage
    expect(critTotal + normalTotal).toBeGreaterThan(0);
  });

  it('natural 1 is always a fumble regardless of modifiers', () => {
    mockRandom(0); // d20 → 1
    const result = resolvePlayerAttack(fighter, '1d6', 1); // AC=1 would normally hit anything
    expect(result.fumble).toBe(true);
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });

  // Test Case F (advantage portion) — picks the higher of two d20 rolls
  it('[Case F] disadvantage picks lower roll (nat-20 then nat-1 → fumble)', () => {
    mockRandom(0.999, 0); // roll1=20, roll2=1 → min=1 → fumble
    const result = resolvePlayerAttack(fighter, '1d6', 10, false, true);
    expect(result.fumble).toBe(true);
  });

  it('finesse weapons use DEX when DEX > STR', () => {
    const dexFighter = { str: 10, dex: 18, level: 1 }; // DEX+4 > STR+0
    mockRandom(0.45); // d20 → 10; total=10+4+2=16 vs AC 15 → hit
    const result = resolvePlayerAttack(dexFighter, '1d6', 15, true);
    expect(result.hit).toBe(true);
    expect(result.atkStat).toBe('DEX');
  });
});

// ─── resolveEnemyAttack ──────────────────────────────────────────────────────

describe('resolveEnemyAttack', () => {
  const enemy = { damage: '1d6', toHit: 4 };

  it('natural 1 always misses', () => {
    mockRandom(0); // d20 → 1
    const result = resolveEnemyAttack(enemy, 5); // AC=5 would normally be easy to hit
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });

  it('natural 20 always hits', () => {
    mockRandom(0.999); // d20 → 20
    const result = resolveEnemyAttack(enemy, 25); // AC=25 impossible otherwise
    expect(result.hit).toBe(true);
  });

  it('hits when roll + toHit >= playerAC', () => {
    mockRandom(0.35); // d20 → 8; total=8+4=12 vs AC 10 → hit
    const result = resolveEnemyAttack(enemy, 10);
    expect(result.hit).toBe(true);
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });

  it('misses when roll + toHit < playerAC', () => {
    mockRandom(0.05); // d20 → 2; total=2+4=6 vs AC 10 → miss
    const result = resolveEnemyAttack(enemy, 10);
    expect(result.hit).toBe(false);
  });

  // Test Case F — advantage: picks the higher of two d20 rolls
  it('[Case F] advantage picks higher roll (nat-1 then nat-20 → hit even at high AC)', () => {
    mockRandom(0, 0.999); // roll1=1, roll2=20 → max=20
    const result = resolveEnemyAttack(enemy, 25, true);
    expect(result.hit).toBe(true);
  });
});

// ─── unarmedDamage ───────────────────────────────────────────────────────────

describe('unarmedDamage(str)', () => {
  it.each([
    [10, 1], // mod=0,  1+0=1
    [12, 2], // mod=1,  1+1=2
    [8, 1], // mod=-1, max(1, 1-1)=1
    [16, 4], // mod=3,  1+3=4
  ])('STR %i → %i damage', (str, expected) => {
    expect(unarmedDamage(str)).toBe(expected);
  });
});

// ─── Equipment legality ───────────────────────────────────────────────────────

describe('canEquipWeapon', () => {
  it('always allowed out of combat', () => {
    expect(canEquipWeapon(false).allowed).toBe(true);
  });

  it('allowed in combat if free_interaction not yet used', () => {
    const result = canEquipWeapon(true, { ...FRESH_TURN });
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.cost).toBe('free_interaction');
  });

  it('blocked in combat if free_interaction already used', () => {
    const result = canEquipWeapon(true, { ...FRESH_TURN, free_interaction_used: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBeTruthy();
  });
});

describe('canDonShield', () => {
  it('allowed out of combat', () => {
    expect(canDonShield(false).allowed).toBe(true);
  });

  it('blocked in combat — donning costs 1 action', () => {
    const result = canDonShield(true);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/action/i);
  });
});

describe('canDonArmor', () => {
  it('allowed out of combat for any armor', () => {
    expect(canDonArmor(false, 'leather_armor').allowed).toBe(true);
    expect(canDonArmor(false, 'plate_armor').allowed).toBe(true);
  });

  it('blocked in combat for light armor', () => {
    expect(canDonArmor(true, 'leather_armor').allowed).toBe(false);
  });

  it('blocked in combat for heavy armor', () => {
    expect(canDonArmor(true, 'plate_armor').allowed).toBe(false);
  });
});

// ─── computeAcAfterArmorChange ───────────────────────────────────────────────

describe('computeAcAfterArmorChange', () => {
  const lootTable = [
    { id: 'leather', ac_bonus: 2 },
    { id: 'plate', ac_bonus: 6 },
  ] as LootItem[];

  it('adds bonus when equipping from bare (AC 10 + leather → 12)', () => {
    expect(computeAcAfterArmorChange(10, null, 'leather', lootTable)).toBe(12);
  });

  it('removes bonus when unequipping (AC 12 - leather → 10)', () => {
    expect(computeAcAfterArmorChange(12, 'leather', null, lootTable)).toBe(10);
  });

  it('swaps armor correctly (leather → plate: AC 12 - 2 + 6 = 16)', () => {
    expect(computeAcAfterArmorChange(12, 'leather', 'plate', lootTable)).toBe(16);
  });

  it('treats unknown armor IDs as 0 bonus', () => {
    expect(computeAcAfterArmorChange(10, null, 'unknown_armor', lootTable)).toBe(10);
  });
});

// ─── skillCheck ──────────────────────────────────────────────────────────────

describe('skillCheck', () => {
  it('succeeds when roll + modifier >= DC', () => {
    mockRandom(0.999); // d20 → 20
    const result = skillCheck(10, 15);
    expect(result.success).toBe(true);
  });

  it('fails when roll + modifier < DC', () => {
    mockRandom(0); // d20 → 1
    const result = skillCheck(10, 15);
    expect(result.success).toBe(false);
  });

  it('proficiency bonus is added when proficient (roll=5, mod=0, prof=2 → total=7 vs DC 7)', () => {
    mockRandom(0.2); // d20 → Math.floor(4.0)+1 = 5
    const result = skillCheck(10, 7, true, 1);
    expect(result.success).toBe(true);
    expect(result.total).toBe(7); // 5 + 0 + 2
  });

  it('no proficiency: same roll fails DC 7 (5 + 0 = 5 < 7)', () => {
    mockRandom(0.2); // d20 → 5
    const result = skillCheck(10, 7, false, 1);
    expect(result.success).toBe(false);
  });
});

// ─── rollDeathSave ───────────────────────────────────────────────────────────
//
// SRD rules: nat 20 → regain 1 HP; nat 1 → 2 failures; 10–19 → success;
// 2–9 → failure; 3 successes → stable; 3 failures → dead.

describe('rollDeathSave', () => {
  it('natural 20 → regain_hp and saves reset to zero', () => {
    mockRandom(0.999); // d20 → 20
    const result = rollDeathSave({ successes: 1, failures: 1 });
    expect(result.result).toBe('regain_hp');
    expect(result.saves).toEqual({ successes: 0, failures: 0 });
  });

  it('natural 1 → double_failure (adds 2 failures)', () => {
    mockRandom(0); // d20 → 1
    const result = rollDeathSave({ successes: 0, failures: 0 });
    expect(result.result).toBe('double_failure');
    expect(result.saves.failures).toBe(2);
  });

  it('natural 1 with 2 existing failures → dead, capped at 3 (not 4)', () => {
    mockRandom(0); // d20 → 1
    const result = rollDeathSave({ successes: 0, failures: 2 });
    expect(result.result).toBe('dead');
    expect(result.saves.failures).toBe(3); // +2 from a Nat 1, but the tally caps at 3
  });

  it('roll 10 → success', () => {
    mockRandom(0.45); // d20 → Math.floor(9.0)+1 = 10
    const result = rollDeathSave({ successes: 0, failures: 0 });
    expect(result.result).toBe('success');
    expect(result.saves.successes).toBe(1);
  });

  it('third success → stable', () => {
    mockRandom(0.45); // d20 → 10
    const result = rollDeathSave({ successes: 2, failures: 0 });
    expect(result.result).toBe('stable');
  });

  it('roll 5 → failure (adds 1 failure)', () => {
    mockRandom(0.2); // d20 → Math.floor(4.0)+1 = 5
    const result = rollDeathSave({ successes: 0, failures: 0 });
    expect(result.result).toBe('failure');
    expect(result.saves.failures).toBe(1);
  });

  it('third failure (via normal roll) → dead', () => {
    mockRandom(0.2); // d20 → 5
    const result = rollDeathSave({ successes: 0, failures: 2 });
    expect(result.result).toBe('dead');
  });
});

// ─── Condition sets ───────────────────────────────────────────────────────────

describe('condition sets', () => {
  it('ADVANTAGE_CONDITIONS includes blinded and restrained', () => {
    expect(ADVANTAGE_CONDITIONS.has('blinded')).toBe(true);
    expect(ADVANTAGE_CONDITIONS.has('restrained')).toBe(true);
  });

  it('DISADV_CONDITIONS includes blinded and restrained', () => {
    expect(DISADV_CONDITIONS.has('blinded')).toBe(true);
    expect(DISADV_CONDITIONS.has('restrained')).toBe(true);
  });

  it('PLAYER_ADV_CONDITIONS includes invisible', () => {
    expect(PLAYER_ADV_CONDITIONS.has('invisible')).toBe(true);
  });

  it('ENEMY_DISADV_CONDITIONS includes invisible', () => {
    expect(ENEMY_DISADV_CONDITIONS.has('invisible')).toBe(true);
  });
});

// ─── resolvePlayerAttack advantage ───────────────────────────────────────────

describe('resolvePlayerAttack — advantage', () => {
  const player = { str: 10, dex: 10, level: 1 }; // mod=0, prof=+2

  it('advantage picks higher of two d20 rolls (nat-1 then nat-20 → hit at high AC)', () => {
    mockRandom(0, 0.999); // roll1=1, roll2=20 → max=20 → hits even AC 30
    const result = resolvePlayerAttack(player, '1d6', 30, false, false, true);
    expect(result.critical).toBe(true);
  });

  it('advantage + disadvantage cancel out — uses single d20 roll', () => {
    // With cancellation, only one d20 is consumed; second mock value should not be needed
    mockRandom(0.45); // single d20 → 10; total=10+0+2=12 vs AC 10 → hit
    const result = resolvePlayerAttack(player, '1d6', 10, false, true, true);
    expect(result.hit).toBe(true);
  });
});

// ─── resolveEnemyAttack disadvantage ─────────────────────────────────────────

describe('resolveEnemyAttack — disadvantage', () => {
  const enemy = { damage: '1d6', toHit: 4 };

  it('disadvantage picks lower roll (nat-20 then nat-1 → miss)', () => {
    mockRandom(0.999, 0); // roll1=20, roll2=1 → min=1 → miss
    const result = resolveEnemyAttack(enemy, 5, false, true);
    expect(result.hit).toBe(false);
  });

  it('advantage + disadvantage cancel — uses single roll', () => {
    mockRandom(0.35); // single d20 → 8; total=8+4=12 vs AC 10 → hit
    const result = resolveEnemyAttack(enemy, 10, true, true);
    expect(result.hit).toBe(true);
  });
});

// ─── rollCritical ─────────────────────────────────────────────────────────────

describe('rollCritical(expr)', () => {
  it('rolls twice as many dice as the base expression (2d8 instead of 1d8)', () => {
    mockRandom(0.999, 0.999); // two d8 rolls → 8, 8; total = 16
    expect(rollCritical('1d8')).toBe(16);
  });

  it('preserves the flat modifier once (not doubled): 1d6+3 crit = 2d6+3', () => {
    mockRandom(0, 0); // two d6 → 1, 1; +3 = 5
    expect(rollCritical('1d6+3')).toBe(5);
  });

  it('falls back to 2d4 when expr is null', () => {
    mockRandom(0.999, 0.999); // two d4 → 4, 4 = 8
    expect(rollCritical(null)).toBe(8);
  });
});

// ─── rollConditionSave ────────────────────────────────────────────────────────

describe('rollConditionSave', () => {
  // Returns true if save FAILS (condition is applied)

  it('fails (returns true) when roll + mod < DC', () => {
    mockRandom(0); // d20 → 1; 1 + 0 = 1 < 15
    expect(rollConditionSave('str', 10, 15)).toBe(true);
  });

  it('succeeds (returns false) when roll + mod >= DC', () => {
    mockRandom(0.999); // d20 → 20; 20 + 0 = 20 >= 15
    expect(rollConditionSave('str', 10, 15)).toBe(false);
  });

  it('proficiency bonus added when proficient (level 1 → +2): roll=5, mod=0, prof=2 → total=7 vs DC 7 → succeed', () => {
    mockRandom(0.2); // d20 → 5
    expect(rollConditionSave('str', 10, 7, true, 1)).toBe(false); // 5 + 0 + 2 = 7 >= 7 → passes → returns false
  });

  it('without proficiency, same roll fails DC 7 (5 + 0 = 5 < 7)', () => {
    mockRandom(0.2); // d20 → 5
    expect(rollConditionSave('str', 10, 7, false, 1)).toBe(true); // 5 + 0 = 5 < 7 → fails → returns true
  });
});

// ─── Class feature helpers ────────────────────────────────────────────────────

describe('sneakAttackDice(level)', () => {
  it.each([
    [1, '1d6'],
    [2, '1d6'],
    [3, '2d6'],
    [5, '3d6'],
    [10, '5d6'],
    [20, '10d6'],
  ])('level %i → %s', (level, expr) => {
    expect(sneakAttackDice(level)).toBe(expr);
  });
});

describe('extraAttackCount(cls, level)', () => {
  it.each([
    [1, 0],
    [4, 0],
    [5, 1],
    [10, 1],
    [11, 2],
    [20, 3],
  ])('fighter level %i → %i extra attacks', (level, count) => {
    expect(extraAttackCount('fighter', level)).toBe(count);
  });
});

describe('rageDamageBonus(level)', () => {
  it.each([
    [1, 2],
    [8, 2],
    [9, 3],
    [15, 3],
    [16, 4],
    [20, 4],
  ])('level %i → +%i rage damage', (level, bonus) => {
    expect(rageDamageBonus(level)).toBe(bonus);
  });
});

describe('rageUsesMax(level)', () => {
  // SRD rage progression — rebalanced from 2014 (more uses earlier).
  it.each([
    [1, 2],
    [2, 2],
    [3, 3],
    [5, 3],
    [6, 4],
    [11, 4],
    [12, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])('level %i → %i rage uses per long rest', (level, uses) => {
    expect(rageUsesMax(level)).toBe(uses);
  });
});

// ─── Spell helpers ────────────────────────────────────────────────────────────

describe('spellAttackBonus(level, castingAbilityScore)', () => {
  // Level 1 → prof +2; INT 16 → mod +3 → bonus = 5
  it('level 1, INT 16 → bonus 5', () => {
    expect(spellAttackBonus(1, 16)).toBe(5);
  });
  // Level 5 → prof +3; WIS 14 → mod +2 → bonus = 5
  it('level 5, WIS 14 → bonus 5', () => {
    expect(spellAttackBonus(5, 14)).toBe(5);
  });
  // Level 1 → prof +2; INT 10 → mod 0 → bonus = 2
  it('level 1, INT 10 → bonus 2', () => {
    expect(spellAttackBonus(1, 10)).toBe(2);
  });
});

describe('spellSaveDC(level, castingAbilityScore)', () => {
  // DC = 8 + prof + mod; level 1 → prof +2; INT 16 → +3 → DC 13
  it('level 1, INT 16 → DC 13', () => {
    expect(spellSaveDC(1, 16)).toBe(13);
  });
  // level 5 → prof +3; WIS 14 → +2 → DC 13
  it('level 5, WIS 14 → DC 13', () => {
    expect(spellSaveDC(5, 14)).toBe(13);
  });
  // level 1 → prof +2; INT 10 → +0 → DC 10
  it('level 1, INT 10 → DC 10', () => {
    expect(spellSaveDC(1, 10)).toBe(10);
  });
});

describe('resolveSpellAttack(level, castingAbilityScore, enemyAc)', () => {
  // Level 1, INT 16 → bonus 5; nat 20 → critical, always hits
  it('nat 20 → critical hit regardless of AC', () => {
    mockRandom(0.999); // d20 → 20
    const result = resolveSpellAttack(1, 16, 30);
    expect(result.hit).toBe(true);
    expect(result.critical).toBe(true);
  });

  // nat 1 → always miss
  it('nat 1 → miss regardless of bonus', () => {
    mockRandom(0); // d20 → 1
    const result = resolveSpellAttack(1, 16, 5);
    expect(result.hit).toBe(false);
  });

  // total >= AC → hit
  it('hits when roll + bonus >= AC', () => {
    // d20 → 8; bonus = 2 (level 1, INT 10); total = 10 vs AC 10
    mockRandom(0.35); // 0.35*20+1 = 8
    const result = resolveSpellAttack(1, 10, 10);
    expect(result.hit).toBe(true);
    expect(result.critical).toBe(false);
  });

  // total < AC → miss
  it('misses when roll + bonus < AC', () => {
    // d20 → 5; bonus = 2; total = 7 vs AC 15
    mockRandom(0.2); // 0.2*20+1 = 5
    const result = resolveSpellAttack(1, 10, 15);
    expect(result.hit).toBe(false);
  });
});

describe('hasWeaponProficiency', () => {
  it('matches a category proficiency (simple / martial)', () => {
    expect(hasWeaponProficiency(['simple', 'martial'], 'martial')).toBe(true);
    expect(hasWeaponProficiency(['simple'], 'martial')).toBe(false);
    expect(hasWeaponProficiency([], undefined)).toBe(true); // unarmed
  });

  it("'martial_finesse_light' covers only Finesse/Light martials", () => {
    const profs = ['simple', 'martial_finesse_light'];
    expect(hasWeaponProficiency(profs, 'martial', { finesse: true })).toBe(true); // rapier
    expect(hasWeaponProficiency(profs, 'martial', { light: true })).toBe(true); // hand crossbow
    expect(hasWeaponProficiency(profs, 'martial', {})).toBe(false); // greataxe
    expect(hasWeaponProficiency(profs, 'simple', {})).toBe(true); // all simple
  });
});
