// Draconic Sorcerer Draconic Resilience (SRD). +1 HP per
// sorcerer level — applied retroactively at subclass-select (the
// existing handleSelectSubclass handles this) AND on every
// subsequent Sorcerer level-up (this PR's wiring).
//
// The AC = 13 + DEX unarmored benefit is NOT modeled — pansori's
// computeTotalAc doesn't carry char/subclass context, and the
// fix would also need to lift Monk + Barbarian unarmored defense
// at the same time (broader change deferred).

import { describe, expect, it } from 'vitest';
import { applyLevelUpForClass } from '../../src/services/gameEngine.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { makeChar } from '../../src/test-fixtures.js';

describe('Draconic Sorcerer — Draconic Resilience', () => {
  it('Sorcerer level-up adds +1 HP from Draconic Resilience', () => {
    // Fixed d6 roll via fixed CON. To isolate the +1 from Draconic
    // Resilience, run two level-ups with identical RNG: one
    // baseline (no subclass), one with subclass='draconic'.
    const baseline = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 1,
      con: 10, // mod 0 so HP roll = d6 + 0 + 0
      hp: 6,
      max_hp: 6,
      hit_die: 6,
    });
    const draconic = makeChar({
      id: 'pc-2',
      character_class: 'Sorcerer',
      level: 1,
      con: 10,
      subclass: 'draconic',
      hp: 6,
      max_hp: 6,
      hit_die: 6,
    });

    // Seed Math.random so both characters roll the same d6.
    const original = Math.random;
    let seed = 0;
    Math.random = () => {
      seed = (seed + 1) % 2;
      return 0.5; // d6 → 4
    };
    try {
      applyLevelUpForClass(baseline, 'Sorcerer', ctx);
      applyLevelUpForClass(draconic, 'Sorcerer', ctx);
    } finally {
      Math.random = original;
    }

    // Both characters got the same d6 roll. Draconic should have
    // +1 more max_hp.
    expect(draconic.max_hp - baseline.max_hp).toBe(1);
  });

  it('Non-Draconic subclass does NOT trigger the bonus', () => {
    const wild = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 1,
      con: 10,
      subclass: 'wild_magic',
      hp: 6,
      max_hp: 6,
      hit_die: 6,
    });
    const noSub = makeChar({
      id: 'pc-2',
      character_class: 'Sorcerer',
      level: 1,
      con: 10,
      hp: 6,
      max_hp: 6,
      hit_die: 6,
    });
    const original = Math.random;
    Math.random = () => 0.5;
    try {
      applyLevelUpForClass(wild, 'Sorcerer', ctx);
      applyLevelUpForClass(noSub, 'Sorcerer', ctx);
    } finally {
      Math.random = original;
    }
    expect(wild.max_hp).toBe(noSub.max_hp);
  });

  it('Draconic Wizard (wrong class) does NOT get the bonus', () => {
    const draconicWiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 1,
      con: 10,
      // Multiclass into Sorcerer/Draconic but level-up a Wizard
      // level — the bonus is keyed on the class being level'd, not
      // just having the subclass.
      class_levels: { wizard: 1, sorcerer: 1 },
      subclass: 'draconic',
      hp: 6,
      max_hp: 6,
      hit_die: 6,
    });
    const baseline = makeChar({
      id: 'pc-2',
      character_class: 'Wizard',
      level: 1,
      con: 10,
      hp: 6,
      max_hp: 6,
      hit_die: 6,
    });
    const original = Math.random;
    Math.random = () => 0.5;
    try {
      applyLevelUpForClass(draconicWiz, 'Wizard', ctx);
      applyLevelUpForClass(baseline, 'Wizard', ctx);
    } finally {
      Math.random = original;
    }
    expect(draconicWiz.max_hp).toBe(baseline.max_hp);
  });
});
