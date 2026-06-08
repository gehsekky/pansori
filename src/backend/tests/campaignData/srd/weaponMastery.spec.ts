// 2024 Weapon Mastery selection — a class masters N weapons it's proficient
// with that have a Mastery property. masterableWeapons computes the legal set;
// resolveWeaponMasteries validates a chosen list (falling back to the default).

import {
  SRD_CLASS_WEAPON_PROFICIENCIES,
  SRD_DEFAULT_WEAPON_MASTERIES,
  defaultWeaponMasteries,
  masterableWeapons,
  resolveWeaponMasteries,
  weaponMasterySlotsForLevel,
} from '../../../src/campaignData/srd/classes.js';
import { describe, expect, it } from 'vitest';
import { SRD_ITEMS } from '../../../src/campaignData/srd/items.js';

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

  it("'martial_finesse_light' masters Finesse/Light martials but not other martials", () => {
    const weapons = [
      { id: 'rapier', name: 'Rapier', weaponType: 'martial', mastery: 'vex', finesse: true },
      {
        id: 'scimitar',
        name: 'Scimitar',
        weaponType: 'martial',
        mastery: 'nick',
        finesse: true,
        light: true,
      },
      { id: 'greataxe', name: 'Greataxe', weaponType: 'martial', mastery: 'cleave' }, // neither
      { id: 'dagger', name: 'Dagger', weaponType: 'simple', mastery: 'nick' }, // simple → always
    ];
    expect(
      masterableWeapons(['simple', 'martial_finesse_light'], weapons).map((w) => w.id)
    ).toEqual(['rapier', 'scimitar', 'dagger']);
  });

  it('a level-1 Rogue masters exactly the SRD-legal set from the real catalog', () => {
    const opts = masterableWeapons(
      SRD_CLASS_WEAPON_PROFICIENCIES.Rogue,
      Object.values(SRD_ITEMS)
    ).map((w) => w.id);
    // The Finesse/Light martials a Rogue may master…
    for (const id of ['rapier', 'scimitar', 'shortsword', 'whip', 'hand_crossbow']) {
      expect(opts, id).toContain(id);
    }
    // …all Simple weapons (a sample)…
    for (const id of ['dagger', 'shortbow', 'club', 'sling', 'mace']) {
      expect(opts, id).toContain(id);
    }
    // …but NOT martial weapons lacking Finesse/Light.
    for (const id of ['greataxe', 'greatsword', 'longsword', 'maul', 'glaive', 'longbow']) {
      expect(opts, id).not.toContain(id);
    }
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

describe('weaponMasterySlotsForLevel', () => {
  it('scales the Fighter: 3 → 4 (L4) → 5 (L10) → 6 (L16)', () => {
    expect(
      [1, 3, 4, 9, 10, 15, 16, 20].map((l) => weaponMasterySlotsForLevel('Fighter', l))
    ).toEqual([3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it('scales the Barbarian: 2 → 3 (L4) → 4 (L10)', () => {
    expect([1, 3, 4, 9, 10, 20].map((l) => weaponMasterySlotsForLevel('Barbarian', l))).toEqual([
      2, 2, 3, 3, 4, 4,
    ]);
  });

  it('keeps Paladin / Ranger / Rogue fixed at 2', () => {
    for (const cls of ['Paladin', 'Ranger', 'Rogue']) {
      expect([1, 5, 11, 20].map((l) => weaponMasterySlotsForLevel(cls, l))).toEqual([2, 2, 2, 2]);
    }
  });

  it('returns 0 for classes without the feature', () => {
    expect(weaponMasterySlotsForLevel('Wizard', 20)).toBe(0);
    expect(weaponMasterySlotsForLevel('Cleric', 8)).toBe(0);
  });
});
