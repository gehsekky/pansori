import type { Character, LootItem } from '../types.js';
import { BASE_ITEMS } from '../campaignData/srd/items.js';
import { getClassLevel } from './multiclass.js';

// SRD: Warlock — Eldritch Invocations.
//
// A Warlock learns invocations as it levels (the Invocations column of the
// Warlock Features table). Known invocations are stored in `Character.feats`
// alongside the two that predate this catalog (Agonizing Blast, Devil's Sight).
// Only invocations the engine models are offered.

export interface InvocationFreeSpell {
  spellId: string;
  /** "on yourself": the caster is always the target. */
  selfOnly?: boolean;
  /** One with Shadows: only while in Dim Light or Darkness. */
  needsDimOrDark?: boolean;
}

export interface InvocationDef {
  id: string;
  name: string;
  /** Minimum Warlock level. */
  minLevel: number;
  /** Another invocation this one requires (e.g. a Pact). */
  requires?: string;
  /** A spell the invocation lets you cast without a slot, at will. */
  freeSpell?: InvocationFreeSpell;
  /** Short menu blurb (our own words). */
  blurb: string;
}

export const INVOCATIONS: InvocationDef[] = [
  {
    id: 'agonizing_blast',
    name: 'Agonizing Blast',
    minLevel: 2,
    blurb: '+CHA to Eldritch Blast damage',
  },
  {
    id: 'armor_of_shadows',
    name: 'Armor of Shadows',
    minLevel: 1,
    freeSpell: { spellId: 'mage_armor', selfOnly: true },
    blurb: 'Mage Armor on yourself, no slot',
  },
  {
    id: 'ascendant_step',
    name: 'Ascendant Step',
    minLevel: 5,
    freeSpell: { spellId: 'levitate', selfOnly: true },
    blurb: 'Levitate on yourself, no slot',
  },
  {
    id: 'devils_sight',
    name: "Devil's Sight",
    minLevel: 2,
    blurb: 'see in magical darkness',
  },
  {
    id: 'eldritch_mind',
    name: 'Eldritch Mind',
    minLevel: 1,
    blurb: 'Advantage on Concentration saves',
  },
  {
    id: 'fiendish_vigor',
    name: 'Fiendish Vigor',
    minLevel: 2,
    freeSpell: { spellId: 'false_life', selfOnly: true },
    blurb: 'False Life (maximum temp HP), no slot',
  },
  {
    id: 'mask_of_many_faces',
    name: 'Mask of Many Faces',
    minLevel: 2,
    freeSpell: { spellId: 'disguise_self', selfOnly: true },
    blurb: 'Disguise Self, no slot',
  },
  {
    id: 'master_of_myriad_forms',
    name: 'Master of Myriad Forms',
    minLevel: 5,
    freeSpell: { spellId: 'alter_self', selfOnly: true },
    blurb: 'Alter Self, no slot',
  },
  {
    id: 'misty_visions',
    name: 'Misty Visions',
    minLevel: 2,
    freeSpell: { spellId: 'silent_image' },
    blurb: 'Silent Image, no slot',
  },
  {
    id: 'one_with_shadows',
    name: 'One with Shadows',
    minLevel: 5,
    freeSpell: { spellId: 'invisibility', selfOnly: true, needsDimOrDark: true },
    blurb: 'Invisibility on yourself in dim light or darkness, no slot',
  },
  {
    id: 'otherworldly_leap',
    name: 'Otherworldly Leap',
    minLevel: 2,
    freeSpell: { spellId: 'jump', selfOnly: true },
    blurb: 'Jump on yourself, no slot',
  },
  {
    id: 'pact_of_the_blade',
    name: 'Pact of the Blade',
    minLevel: 1,
    blurb: 'bond a melee weapon: proficiency, and CHA for its attack and damage',
  },
  {
    id: 'thirsting_blade',
    name: 'Thirsting Blade',
    minLevel: 5,
    requires: 'pact_of_the_blade',
    blurb: 'Extra Attack with your pact weapon',
  },
  {
    id: 'eldritch_smite',
    name: 'Eldritch Smite',
    minLevel: 5,
    requires: 'pact_of_the_blade',
    blurb: 'spend a Pact Magic slot on a pact-weapon hit for force damage and Prone',
  },
  {
    id: 'lifedrinker',
    name: 'Lifedrinker',
    minLevel: 9,
    requires: 'pact_of_the_blade',
    blurb: '+1d6 necrotic once per turn on a pact-weapon hit',
  },
  {
    id: 'devouring_blade',
    name: 'Devouring Blade',
    minLevel: 12,
    requires: 'thirsting_blade',
    blurb: 'Thirsting Blade grants two extra attacks',
  },
  {
    id: 'visions_of_distant_realms',
    name: 'Visions of Distant Realms',
    minLevel: 9,
    freeSpell: { spellId: 'arcane_eye' },
    blurb: 'Arcane Eye, no slot',
  },
  {
    id: 'whispers_of_the_grave',
    name: 'Whispers of the Grave',
    minLevel: 7,
    freeSpell: { spellId: 'speak_with_dead' },
    blurb: 'Speak with Dead, no slot',
  },
];

const BY_ID = new Map(INVOCATIONS.map((i) => [i.id, i]));

export function invocationDef(id: string): InvocationDef | undefined {
  return BY_ID.get(id);
}

/** SRD Warlock Features table — the Invocations column. */
export function invocationsKnownMax(warlockLevel: number): number {
  if (warlockLevel < 1) return 0;
  const table: [number, number][] = [
    [18, 10],
    [15, 9],
    [12, 8],
    [9, 7],
    [7, 6],
    [5, 5],
    [2, 3],
    [1, 1],
  ];
  return table.find(([lvl]) => warlockLevel >= lvl)![1];
}

export function hasInvocation(char: Pick<Character, 'feats'>, id: string): boolean {
  return (char.feats ?? []).includes(id);
}

/** The invocations this character knows. */
export function knownInvocations(char: Pick<Character, 'feats'>): InvocationDef[] {
  return (char.feats ?? []).map((f) => BY_ID.get(f)).filter((d): d is InvocationDef => !!d);
}

/** Invocations the character may learn now (prerequisites met, slot free). */
export function learnableInvocations(char: Character): InvocationDef[] {
  const wl = getClassLevel(char, 'warlock');
  if (knownInvocations(char).length >= invocationsKnownMax(wl)) return [];
  return INVOCATIONS.filter(
    (d) =>
      !hasInvocation(char, d.id) &&
      wl >= d.minLevel &&
      (!d.requires || hasInvocation(char, d.requires))
  );
}

/**
 * SRD Pact of the Blade — whether `weapon` is the Warlock's bonded pact weapon
 * (the inventory instance recorded in `Character.pact_weapon`).
 */
export function isPactWeapon(
  char: Pick<Character, 'feats' | 'pact_weapon'>,
  weapon: { instance_id?: string } | null | undefined
): boolean {
  return (
    hasInvocation(char, 'pact_of_the_blade') &&
    !!char.pact_weapon &&
    weapon?.instance_id === char.pact_weapon
  );
}

/** Extra attacks from Thirsting Blade (1) / Devouring Blade (2), pact weapon only. */
export function pactWeaponExtraAttacks(char: Pick<Character, 'feats'>): number {
  if (hasInvocation(char, 'devouring_blade')) return 2;
  return hasInvocation(char, 'thirsting_blade') ? 1 : 0;
}

/**
 * Weapons Pact of the Blade can conjure: the mundane SRD Simple / Martial
 * Melee weapons (Dart is a Ranged weapon in the SRD).
 */
export function conjurablePactWeapons(): LootItem[] {
  return Object.values(BASE_ITEMS).filter(
    (l) =>
      l.slot === 'weapon' &&
      l.range === 'melee' &&
      (l.weaponType === 'simple' || l.weaponType === 'martial') &&
      l.id !== 'dart'
  );
}

/**
 * The highest spell-slot level with a slot left (a Warlock's Pact Magic slots
 * are all one level), or 0 when none is open. Eldritch Smite spends it.
 */
export function highestOpenSlot(
  char: Pick<Character, 'spell_slots_max' | 'spell_slots_used'>
): number {
  const levels = Object.keys(char.spell_slots_max ?? {})
    .map(Number)
    .sort((a, b) => b - a);
  return (
    levels.find((l) => (char.spell_slots_used?.[l] ?? 0) < (char.spell_slots_max?.[l] ?? 0)) ?? 0
  );
}
