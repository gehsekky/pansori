import type { Character } from '../types.js';
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
