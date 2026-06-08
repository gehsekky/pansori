// Shared SRD backgrounds resource — integrity + no-drift regression.
//
// SRD_BACKGROUNDS holds the canonical background mechanics; campaigns supply
// only flavor (desc / featureDesc) via srdBackgrounds(). These tests lock that
// the catalog is well-formed, the override helper touches only flavor, and
// every shipped context's backgrounds share the canonical mechanics (so a
// re-inlined, drifted copy fails CI).

import {
  ALL_SRD_BACKGROUND_IDS,
  SRD_BACKGROUNDS,
  srdBackgrounds,
} from '../../../campaignData/srd/backgrounds.js';
import { describe, expect, it } from 'vitest';
import { context as sandbox } from '../../../campaignData/sandbox.js';
import { context as vale } from '../../../campaignData/malgovia/index.js';

// Mechanical fields that must be identical across every campaign.
const MECHANICAL = [
  'name',
  'skillProficiencies',
  'toolProficiency',
  'feature',
  'originFeat',
  'abilityScoreIncreases',
  'language',
] as const;

describe('SRD_BACKGROUNDS catalog integrity', () => {
  it('every entry key matches its id and carries 2024 mechanics', () => {
    expect(ALL_SRD_BACKGROUND_IDS).toHaveLength(4);
    for (const [key, bg] of Object.entries(SRD_BACKGROUNDS)) {
      expect(bg.id).toBe(key);
      expect(bg.skillProficiencies.length).toBe(2);
      expect(bg.originFeat).toBeTruthy();
      expect(bg.abilityScoreIncreases?.length).toBe(3);
      expect(bg.language).toBeTruthy();
    }
  });
});

describe('srdBackgrounds selector', () => {
  it('returns the canonical objects by reference when given no overrides', () => {
    const list = srdBackgrounds();
    expect(list).toHaveLength(4);
    expect(list[0]).toBe(SRD_BACKGROUNDS.soldier);
  });

  it('overrides only desc / featureDesc, preserving mechanics', () => {
    const [soldier] = srdBackgrounds({ soldier: { desc: 'Custom flavor.' } });
    expect(soldier.desc).toBe('Custom flavor.');
    // Mechanics untouched.
    expect(soldier.skillProficiencies).toEqual(SRD_BACKGROUNDS.soldier.skillProficiencies);
    expect(soldier.originFeat).toBe(SRD_BACKGROUNDS.soldier.originFeat);
    expect(soldier.featureDesc).toBe(SRD_BACKGROUNDS.soldier.featureDesc); // not overridden
    // Doesn't mutate the shared catalog.
    expect(SRD_BACKGROUNDS.soldier.desc).not.toBe('Custom flavor.');
  });
});

describe('no drift — shipped contexts share the canonical background mechanics', () => {
  const contexts = [
    ['sandbox', sandbox],
    ['malgovia', vale],
  ] as const;

  for (const [name, ctx] of contexts) {
    it(`${name}: every background's mechanics match SRD_BACKGROUNDS`, () => {
      for (const bg of ctx.backgrounds ?? []) {
        const canon = SRD_BACKGROUNDS[bg.id];
        expect(canon, `${name}: unknown background ${bg.id}`).toBeDefined();
        for (const field of MECHANICAL) {
          expect(bg[field], `${name} ${bg.id}.${field}`).toEqual(canon[field]);
        }
      }
    });
  }
});
