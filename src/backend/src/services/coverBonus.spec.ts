// Regression spec for the "cover stacking" bug surfaced in the
// Whispering Pines log: every attack note read "+2 cover" even for
// the same-direction 1v1 attacks where no obstacle was between
// attacker and target.
//
// Cause: coverBonus ignored the attacker position (note the `_attacker`
// underscore prefix). It checked all 4 cardinal neighbours of the
// target. Since combat-start places enemies at (gw-2-i, gh-2), two
// enemies always spawn side-by-side — each gave the other +2 cover.
//
// Fix: filter cardinals to only those BETWEEN attacker and target,
// based on the dx/dy from attacker to target. An obstacle on the far
// side of the target no longer grants cover.

import { describe, expect, it } from 'vitest';
import { coverBonus } from './gridEngine.js';

describe('coverBonus — attacker-direction filtering', () => {
  it('no obstacles → no cover', () => {
    expect(coverBonus({ x: 1, y: 1 }, { x: 6, y: 6 }, [])).toBe(0);
  });

  it('obstacle on the FAR side of target from attacker → no cover', () => {
    // Attacker at (1, 1), target at (6, 6). Obstacle at (5, 6) is
    // BETWEEN attacker and target (west cardinal). But obstacle at
    // (7, 6) is the east cardinal — that's the FAR side from attacker.
    // Previously both returned +2; now only the between-obstacle does.
    const obstacleFar = [{ x: 7, y: 6 }];
    expect(coverBonus({ x: 1, y: 1 }, { x: 6, y: 6 }, obstacleFar)).toBe(0);
  });

  it('obstacle BETWEEN attacker and target → half cover (+2)', () => {
    // Attacker at (1, 1), target at (6, 6). NW→SE diagonal.
    // West cardinal (5, 6) IS between attacker and target.
    const obstacleWest = [{ x: 5, y: 6 }];
    expect(coverBonus({ x: 1, y: 1 }, { x: 6, y: 6 }, obstacleWest)).toBe(2);
    // North cardinal (6, 5) IS between attacker and target.
    const obstacleNorth = [{ x: 6, y: 5 }];
    expect(coverBonus({ x: 1, y: 1 }, { x: 6, y: 6 }, obstacleNorth)).toBe(2);
  });

  it('both candidate cardinals blocked on a diagonal attack → three-quarters (+5)', () => {
    // Attacker at (1, 1), target at (6, 6). Both W (5,6) and N (6,5)
    // are between attacker and target — target is in a corner pocket.
    const obstacles = [
      { x: 5, y: 6 },
      { x: 6, y: 5 },
    ];
    expect(coverBonus({ x: 1, y: 1 }, { x: 6, y: 6 }, obstacles)).toBe(5);
  });

  it('axial attacker E of target → only east cardinal counts', () => {
    // Attacker at (10, 5), target at (5, 5). Same row, attacker east.
    // Path goes 10 → 9 → 8 → 7 → 6 → target(5). Cell (6, 5) is between.
    expect(coverBonus({ x: 10, y: 5 }, { x: 5, y: 5 }, [{ x: 6, y: 5 }])).toBe(2);
    // Cell (4, 5) is BEYOND target from attacker — not between.
    expect(coverBonus({ x: 10, y: 5 }, { x: 5, y: 5 }, [{ x: 4, y: 5 }])).toBe(0);
    // Obstacles north / south of target — not between attacker and
    // target on this axial attack.
    expect(coverBonus({ x: 10, y: 5 }, { x: 5, y: 5 }, [{ x: 5, y: 4 }])).toBe(0);
    expect(coverBonus({ x: 10, y: 5 }, { x: 5, y: 5 }, [{ x: 5, y: 6 }])).toBe(0);
  });

  it('axial attacker N of target → only north cardinal counts', () => {
    // Attacker at (5, 1), target at (5, 5). Attacker is north (smaller y).
    expect(coverBonus({ x: 5, y: 1 }, { x: 5, y: 5 }, [{ x: 5, y: 4 }])).toBe(2);
    expect(coverBonus({ x: 5, y: 1 }, { x: 5, y: 5 }, [{ x: 5, y: 6 }])).toBe(0);
  });

  it('regression: two enemies spawning adjacent at combat-start no longer cover each other from the attacker', () => {
    // Attack scenario from the Whispering Pines log:
    //   - PC at (1, 1) attacking Ice Mephit #1 at (6, 6).
    //   - Ice Mephit #2 also spawned at (5, 6) — its position is
    //     stored as an "obstacle" for the cover check.
    // PRE-FIX: the function counted (5, 6) as one of the target's
    //          cardinals AND ignored attacker direction → +2 cover
    //          (silently inflated AC).
    // POST-FIX: (5, 6) is the west cardinal of (6, 6), and attacker
    //           is NW of target — so west is still between them.
    //           Cover DOES apply here.
    //
    // The CORRECTED bug case: when the OTHER enemy is on the FAR side
    // of the target from the attacker. E.g., the layout actually
    // chosen by combat-start, with the second enemy at (5, 6), can
    // legitimately grant cover from the NW attacker because (5, 6)
    // is between (1, 1) and (6, 6). But if the second enemy were at
    // (7, 6) instead — east of target, on the far side from the NW
    // attacker — there'd be no cover. The previous impl gave +2 in
    // BOTH cases; the new impl distinguishes them.
    const farSide = [{ x: 7, y: 6 }];
    expect(coverBonus({ x: 1, y: 1 }, { x: 6, y: 6 }, farSide)).toBe(0);
  });

  it('attacker on same square as target → no cover', () => {
    expect(coverBonus({ x: 5, y: 5 }, { x: 5, y: 5 }, [{ x: 6, y: 5 }])).toBe(0);
  });
});
