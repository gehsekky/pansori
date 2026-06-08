// Direct tests for resolveEnemyHideCheck — the first sub-routine
// extracted from runEnemyTurns toward the monsters-as-action-subjects
// refactor (architecture audit #5). Keeps the contract observable
// without a full enemy-turn integration test.

import type { Character, Enemy } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { resolveEnemyHideCheck } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyWithWis = (wis: number): Enemy =>
  ({
    id: 'goblin-1',
    name: 'Goblin',
    hp: 10,
    ac: 12,
    damage: '1d6',
    toHit: 3,
    xp: 20,
    wis,
  }) as unknown as Enemy;

const hiddenTarget = (overrides: Partial<Character> = {}): Character =>
  makeChar({ id: 'pc-1', conditions: ['invisible'], hide_dc: 15, ...overrides });

describe('resolveEnemyHideCheck', () => {
  it("returns 'not-hidden' when the target lacks invisible / hide_dc", () => {
    const target = makeChar({ id: 'pc-1' }); // not invisible
    const st = makeState();
    const result = resolveEnemyHideCheck(enemyWithWis(12), target, 0, st);
    expect(result.outcome).toBe('not-hidden');
    expect(result.narrative).toBe('');
    expect(result.st).toBe(st); // unchanged
  });

  it("returns 'spotted-passive' when enemy passive Perception ≥ hide DC", () => {
    // Enemy WIS 16 → mod +3 → passive 13. Hide DC 12 → spotted passively.
    const target = hiddenTarget({ hide_dc: 12 });
    const st = { ...makeState(), characters: [target] };
    const result = resolveEnemyHideCheck(enemyWithWis(16), target, 0, st);
    expect(result.outcome).toBe('spotted-passive');
    expect(result.narrative).toMatch(/passive Perception 13 vs hide DC 12/);
    // Invisible condition dropped; hide_dc cleared
    expect(result.target.conditions).not.toContain('invisible');
    expect(result.target.hide_dc).toBeUndefined();
    expect(result.st.characters[0].conditions).not.toContain('invisible');
  });

  it("returns 'spotted-active' when passive fails but active Search ≥ DC", () => {
    // Enemy WIS 10 → mod +0 → passive 10. Hide DC 15. d20 → 20 → active 20 ≥ 15.
    mockRandom(0.99); // d20 → 20
    const target = hiddenTarget({ hide_dc: 15 });
    const st = { ...makeState(), characters: [target] };
    const result = resolveEnemyHideCheck(enemyWithWis(10), target, 0, st);
    expect(result.outcome).toBe('spotted-active');
    expect(result.narrative).toMatch(/actively searches and locates/);
    expect(result.narrative).toMatch(/attack forfeited this turn/);
    expect(result.target.conditions).not.toContain('invisible');
    expect(result.target.hide_dc).toBeUndefined();
  });

  it("returns 'not-spotted' when both checks fail", () => {
    // Enemy WIS 10 → passive 10. Hide DC 20. d20 → 1 → active 1 < 20.
    mockRandom(0); // d20 → 1
    const target = hiddenTarget({ hide_dc: 20 });
    const st = { ...makeState(), characters: [target] };
    const result = resolveEnemyHideCheck(enemyWithWis(10), target, 0, st);
    expect(result.outcome).toBe('not-spotted');
    expect(result.narrative).toMatch(/cannot find/);
    expect(result.narrative).toMatch(/turn lost/);
    // PC stays hidden — invisible condition preserved
    expect(result.target.conditions).toContain('invisible');
    expect(result.target.hide_dc).toBe(20);
  });
});
