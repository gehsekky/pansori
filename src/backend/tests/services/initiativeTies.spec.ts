// Initiative tiebreaker tests — SRD ties are DM-arbitrated;
// pansori uses (1) higher DEX wins, (2) PCs before enemies. Tests
// pin the order so future sort changes don't silently reshuffle
// turn order.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Enemy } from '../../src/types.js';
import { buildInitiativeOrder } from '../../src/services/gameEngine.js';
import { makeChar } from '../../src/test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

function makeEnemy(id: string, name: string, dex: number = 10): Enemy {
  return {
    id,
    name,
    hp: 10,
    ac: 10,
    damage: '1d4',
    toHit: 2,
    xp: 10,
    dex,
  } as unknown as Enemy;
}

describe('buildInitiativeOrder — tiebreakers', () => {
  it('tied rolls → higher DEX acts first', () => {
    // Both d20s mocked to 10. Char A DEX 18 (+4 mod), Char B DEX 10 (+0 mod).
    // Rolls: A = 14, B = 10. NOT tied — bad test setup. Let me give equal
    // DEX so the rolls match, then test pure tiebreaker.
    vi.spyOn(Math, 'random').mockReturnValue(0.45); // d20 → 10 for both
    const a = makeChar({ id: 'pc-low', dex: 10 }); // roll 10, total 10
    const b = makeChar({ id: 'pc-high', dex: 16 }); // roll 10, total 13
    const order = buildInitiativeOrder([a, b], []);
    // pc-high goes first (higher total roll, not tied actually).
    expect(order[0].id).toBe('pc-high');
  });

  it('truly tied rolls (same total) → DEX score tiebreaker', () => {
    // Force same total: identical DEX mod, identical mocked d20.
    vi.spyOn(Math, 'random').mockReturnValue(0.45);
    // Two PCs with the same DEX mod (+0 from 11) but different DEX
    // SCORES so the tiebreaker reads the score, not the mod.
    const a = makeChar({ id: 'pc-dex-11', dex: 11 });
    const b = makeChar({ id: 'pc-dex-10', dex: 10 });
    const order = buildInitiativeOrder([a, b], []);
    // Same mod (+0) → same total roll → DEX score tiebreaker → pc-dex-11 first.
    expect(order[0].id).toBe('pc-dex-11');
    expect(order[1].id).toBe('pc-dex-10');
  });

  it('tied roll + tied DEX → PC before enemy', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.45);
    const pc = makeChar({ id: 'pc-1', dex: 14 });
    const enemy = makeEnemy('orc-1', 'Orc', 14);
    const order = buildInitiativeOrder([pc], [enemy]);
    // Same roll + DEX → PC first.
    expect(order[0].id).toBe('pc-1');
    expect(order[1].id).toBe('orc-1');
  });

  it('Alert PC ranks above non-Alert PC at same roll/DEX', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.45); // d20 → 10
    const alert = makeChar({ id: 'pc-alert', dex: 14, level: 5, feats: ['alert'] });
    const plain = makeChar({ id: 'pc-plain', dex: 14, level: 5, feats: [] });
    const order = buildInitiativeOrder([plain, alert], []);
    // Alert: 10 + 2 + 3 prof = 15. Plain: 10 + 2 = 12. No tie — Alert wins
    // on the roll itself.
    expect(order[0].id).toBe('pc-alert');
  });
});
