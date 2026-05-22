// PAM OA-on-enter-reach. RAW 2024 PHB Polearm Master:
// "Other creatures provoke an opportunity attack from you when
// they enter the reach you have with [the polearm]."
//
// Mirror of the standard exit-reach OA. Pansori already fires
// PC OAs when an enemy moves OUT of reach; PAM adds the entry
// trigger via the new pamEnterReachTriggers helper.

import { describe, expect, it } from 'vitest';
import type { CombatEntity } from '../types.js';
import { pamEnterReachTriggers } from './gridEngine.js';

function pc(id: string, x: number, y: number): CombatEntity {
  return {
    id,
    isEnemy: false,
    pos: { x, y },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
  };
}

function enemy(id: string, x: number, y: number): CombatEntity {
  return {
    id,
    isEnemy: true,
    pos: { x, y },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
  };
}

describe('pamEnterReachTriggers', () => {
  it('flags PCs whose reach the enemy enters', () => {
    // PC at (5, 5) with 10 ft reach (polearm).
    // Enemy starts at (1, 5) — 20 ft away. Moves to (3, 5) — 10 ft.
    // Crosses INTO PC's reach.
    const entities: CombatEntity[] = [pc('pc-1', 5, 5), enemy('orc', 1, 5)];
    const triggers = pamEnterReachTriggers({ x: 1, y: 5 }, { x: 3, y: 5 }, entities, true, (e) =>
      e.id === 'pc-1' ? 10 : 0
    );
    expect(triggers.map((t) => t.id)).toEqual(['pc-1']);
  });

  it('does NOT flag PCs whose reach was already in range pre-move', () => {
    // Enemy was already adjacent → no entry trigger.
    const entities: CombatEntity[] = [pc('pc-1', 5, 5), enemy('orc', 6, 5)];
    const triggers = pamEnterReachTriggers(
      { x: 6, y: 5 },
      { x: 5, y: 6 }, // moved but still in reach
      entities,
      true,
      (e) => (e.id === 'pc-1' ? 10 : 0)
    );
    expect(triggers).toHaveLength(0);
  });

  it('does NOT flag PCs without PAM reach (callback returns 0)', () => {
    const entities: CombatEntity[] = [pc('pc-no-pam', 5, 5), enemy('orc', 1, 5)];
    const triggers = pamEnterReachTriggers(
      { x: 1, y: 5 },
      { x: 3, y: 5 },
      entities,
      true,
      () => 0 // no PCs have PAM
    );
    expect(triggers).toHaveLength(0);
  });

  it('respects the moverIsEnemy flag — moving PC entering enemy reach flags the enemy', () => {
    // Inverse case: PC moves from (1, 5) to (4, 5). PAM-wielding
    // enemy at (5, 5) with 10 ft reach.
    // Pre: distance((5,5), (1,5)) = 20 ft. Not in reach.
    // Post: distance((5,5), (4,5)) = 5 ft. In reach.
    const entities: CombatEntity[] = [pc('pc-1', 4, 5), enemy('orc-pam', 5, 5)];
    const triggers = pamEnterReachTriggers(
      { x: 1, y: 5 },
      { x: 4, y: 5 },
      entities,
      false, // mover is PC
      (e) => (e.id === 'orc-pam' ? 10 : 0)
    );
    expect(triggers.map((t) => t.id)).toEqual(['orc-pam']);
  });
});
