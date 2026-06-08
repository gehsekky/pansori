// Polearm reach (10 ft) — glaive, halberd, and pike have the
// Reach property. The grid engine's inRange helper reads
// `weapon.reach: true` and extends melee reach from 5 ft to 10 ft.
//
// This spec pins the data wiring — the 3 polearm loot entries
// must set `reach: true` so a wielder can attack a target 10 ft
// (one square diagonal or two squares straight) away.

import { describe, expect, it } from 'vitest';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { inRange } from '../../src/services/gridEngine.js';

describe('Polearm reach property', () => {
  const lookup = (id: string) => ctx.lootTable.find((l) => l.id === id);

  it('glaive has reach: true', () => {
    const weapon = lookup('glaive');
    expect(weapon?.reach).toBe(true);
  });

  it('halberd has reach: true', () => {
    const weapon = lookup('halberd');
    expect(weapon?.reach).toBe(true);
  });

  it('pike has reach: true', () => {
    const weapon = lookup('pike');
    expect(weapon?.reach).toBe(true);
  });

  it('spear does NOT have reach (standard 5 ft)', () => {
    const weapon = lookup('spear');
    expect(weapon?.reach).toBeFalsy();
  });

  it('quarterstaff does NOT have reach', () => {
    const weapon = lookup('quarterstaff');
    expect(weapon?.reach).toBeFalsy();
  });

  it('inRange honors the property — glaive can hit 10 ft away (two squares)', () => {
    const glaive = lookup('glaive');
    if (!glaive) throw new Error('glaive missing');
    // Attacker at (4, 5), target at (6, 5) — 10 ft straight (2 squares).
    // Without reach: out of range. With reach: in range.
    expect(inRange({ x: 4, y: 5 }, { x: 6, y: 5 }, glaive)).toBe(true);
  });

  it('inRange — non-reach melee fails at 10 ft', () => {
    const longsword = lookup('longsword');
    if (!longsword) throw new Error('longsword missing');
    expect(inRange({ x: 4, y: 5 }, { x: 6, y: 5 }, longsword)).toBe(false);
  });
});
