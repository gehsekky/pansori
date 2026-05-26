// 2024 Weapon Mastery selection — a class masters N weapons it's proficient
// with that have a Mastery property. masterableWeapons computes the legal set;
// resolveWeaponMasteries validates a chosen list (falling back to the default).

import {
  SRD_DEFAULT_WEAPON_MASTERIES,
  defaultWeaponMasteries,
  masterableWeapons,
  resolveWeaponMasteries,
} from './classes.js';
import { describe, expect, it } from 'vitest';

const WEAPONS = [
  { id: 'longsword', name: 'Longsword', weaponType: 'martial', mastery: 'sap' },
  { id: 'shortbow', name: 'Shortbow', weaponType: 'simple', mastery: 'vex' },
  { id: 'greataxe', name: 'Greataxe', weaponType: 'martial', mastery: 'cleave' },
  { id: 'club', name: 'Club', weaponType: 'simple' }, // no mastery → never offered
  { id: 'net', name: 'Net', weaponType: 'martial' }, // no mastery
];

describe('masterableWeapons', () => {
  it('offers only weapons with a mastery property the class is proficient with', () => {
    // simple + martial proficiency → both masterable weapons, never the
    // mastery-less club/net.
    const all = masterableWeapons(['simple', 'martial'], WEAPONS).map((w) => w.id);
    expect(all).toEqual(['longsword', 'shortbow', 'greataxe']);
    // simple-only proficiency → only the simple masterable weapon.
    expect(masterableWeapons(['simple'], WEAPONS).map((w) => w.id)).toEqual(['shortbow']);
  });

  it('honors a specifically-named weapon proficiency (e.g. Monk shortsword)', () => {
    const weapons = [
      { id: 'shortsword', name: 'Shortsword', weaponType: 'martial', mastery: 'vex' },
    ];
    // No category proficiency, but the named 'shortsword' prof unlocks it.
    expect(masterableWeapons(['simple', 'shortsword'], weapons).map((w) => w.id)).toEqual([
      'shortsword',
    ]);
  });
});

describe('defaultWeaponMasteries', () => {
  const optionIds = ['longsword', 'shortbow', 'greataxe', 'handaxe'];

  it('returns exactly `count` options, preferring the curated picks', () => {
    expect(defaultWeaponMasteries(['greataxe', 'handaxe'], optionIds, 2)).toEqual([
      'greataxe',
      'handaxe',
    ]);
  });

  it('tops up from the options when the curated list is short or unavailable', () => {
    // 'warhammer' isn't an option here → fill from the option list.
    const def = defaultWeaponMasteries(['warhammer'], optionIds, 2);
    expect(def).toHaveLength(2);
    expect(optionIds).toEqual(expect.arrayContaining(def));
  });

  it('returns [] for a class with no slots', () => {
    expect(defaultWeaponMasteries(['greataxe'], optionIds, 0)).toEqual([]);
  });
});

describe('resolveWeaponMasteries', () => {
  const optionIds = ['longsword', 'shortbow', 'greataxe'];

  it('accepts a valid pick (right count, all offered, distinct)', () => {
    expect(resolveWeaponMasteries(['longsword', 'greataxe'], optionIds, 2, ['shortbow'])).toEqual([
      'longsword',
      'greataxe',
    ]);
  });

  it('falls back to the default on wrong count / unoffered / duplicate / omitted', () => {
    const def = defaultWeaponMasteries(['shortbow'], optionIds, 2);
    expect(resolveWeaponMasteries(['longsword'], optionIds, 2, ['shortbow'])).toEqual(def); // too few
    expect(resolveWeaponMasteries(['longsword', 'dagger'], optionIds, 2, ['shortbow'])).toEqual(
      def
    ); // unoffered
    expect(resolveWeaponMasteries(undefined, optionIds, 2, ['shortbow'])).toEqual(def); // omitted
  });

  it('returns [] for a class with no slots regardless of input', () => {
    expect(resolveWeaponMasteries(['longsword'], optionIds, 0, [])).toEqual([]);
  });

  it('the curated SRD defaults are weapons with mastery (sanity check)', () => {
    // Every default-mastery class lists at least one weapon.
    for (const [cls, picks] of Object.entries(SRD_DEFAULT_WEAPON_MASTERIES)) {
      expect(picks.length, cls).toBeGreaterThan(0);
    }
  });
});
