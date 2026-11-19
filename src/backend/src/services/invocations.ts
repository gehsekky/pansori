import type { Character, LootItem, Spell } from '../types.js';
import { BASE_ITEMS } from '../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../campaignData/srd/monsters.js';
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
  /** Gift of the Depths: once, then not again until a Long Rest. */
  oncePerLongRest?: boolean;
}

export interface InvocationDef {
  id: string;
  name: string;
  /** Minimum Warlock level. */
  minLevel: number;
  /** Another invocation this one requires (e.g. a Pact). */
  requires?: string;
  /** A spell the Warlock must know (e.g. a damaging Warlock cantrip). */
  requiresSpell?: string;
  /** A spell the invocation lets you cast without a slot, at will. */
  freeSpell?: InvocationFreeSpell;
  /** Lessons of the First Ones: can be learned more than once. */
  repeatable?: boolean;
  /** Short menu blurb (our own words). */
  blurb: string;
}

export const INVOCATIONS: InvocationDef[] = [
  {
    id: 'agonizing_blast',
    name: 'Agonizing Blast',
    minLevel: 2,
    requiresSpell: 'eldritch_blast',
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
    id: 'eldritch_spear',
    name: 'Eldritch Spear',
    minLevel: 2,
    requiresSpell: 'eldritch_blast',
    blurb: 'Eldritch Blast range +30 ft per Warlock level',
  },
  {
    id: 'pact_of_the_chain',
    name: 'Pact of the Chain',
    minLevel: 1,
    freeSpell: { spellId: 'find_familiar' },
    blurb: 'Find Familiar without a slot, special forms, and familiar attacks',
  },
  {
    id: 'pact_of_the_tome',
    name: 'Pact of the Tome',
    minLevel: 1,
    blurb: 'a Book of Shadows with 3 cantrips and 2 ritual spells from any list',
  },
  {
    id: 'repelling_blast',
    name: 'Repelling Blast',
    minLevel: 2,
    requiresSpell: 'eldritch_blast',
    blurb: 'Eldritch Blast pushes a Large or smaller target 10 ft',
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
    id: 'gaze_of_two_minds',
    name: 'Gaze of Two Minds',
    minLevel: 5,
    blurb: 'link senses with an ally (Bonus Action) and cast spells from their space',
  },
  {
    id: 'gift_of_the_depths',
    name: 'Gift of the Depths',
    minLevel: 5,
    freeSpell: { spellId: 'water_breathing', oncePerLongRest: true },
    blurb: 'Swim Speed, breathe underwater, and Water Breathing once per Long Rest without a slot',
  },
  {
    id: 'gift_of_the_protectors',
    name: 'Gift of the Protectors',
    minLevel: 9,
    requires: 'pact_of_the_tome',
    blurb: 'allies named in your Book of Shadows drop to 1 HP instead of 0 (once per Long Rest)',
  },
  {
    id: 'investment_of_the_chain_master',
    name: 'Investment of the Chain Master',
    minLevel: 5,
    requires: 'pact_of_the_chain',
    blurb: 'command your familiar to attack as a Bonus Action',
  },
  {
    id: 'lessons_of_the_first_ones',
    name: 'Lessons of the First Ones',
    minLevel: 2,
    repeatable: true,
    blurb: 'gain an Origin feat (repeatable)',
  },
  {
    id: 'witch_sight',
    name: 'Witch Sight',
    minLevel: 15,
    blurb: 'Truesight out to 30 ft',
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

/** How many times the character has learned invocation `id` (repeatables). */
export function invocationCount(char: Pick<Character, 'feats'>, id: string): number {
  return (char.feats ?? []).filter((f) => f === id).length;
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
      (d.repeatable
        ? lessonsFeatOptions(char).length > pendingLessonsFeats(char)
        : !hasInvocation(char, d.id)) &&
      wl >= d.minLevel &&
      (!d.requires || hasInvocation(char, d.requires)) &&
      (!d.requiresSpell || (char.spells_known ?? []).includes(d.requiresSpell))
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

/**
 * SRD Pact of the Chain — the special familiar forms, from their stat blocks.
 * (Familiars can't attack on their own turn; see `familiar_attack`.)
 */
const CHAIN_FORM_KEYS = [
  'imp',
  'pseudodragon',
  'quasit',
  'skeleton',
  'sphinx_of_wonder',
  'sprite',
  'venomous_snake',
] as const;

export function pactChainForms(): {
  name: string;
  ac: number;
  maxHp: number;
  toHit: number;
  damage: string;
}[] {
  return CHAIN_FORM_KEYS.map((k) => SRD_MONSTERS[k]).map((m) => ({
    name: m.name,
    ac: m.ac,
    maxHp: m.hp,
    toHit: m.toHit,
    damage: m.damage,
  }));
}

/** SRD Pact of the Tome — the Book of Shadows' spells. */
export function bookOfShadowsSpells(char: Pick<Character, 'book_of_shadows'>): string[] {
  return [...(char.book_of_shadows?.cantrips ?? []), ...(char.book_of_shadows?.rituals ?? [])];
}

/** Cantrips (any class list) the Book of Shadows can take. */
export function tomeCantripOptions(
  char: Pick<Character, 'spells_known'>,
  spellTable: Record<string, Spell>
): Spell[] {
  const known = new Set(char.spells_known ?? []);
  return Object.values(spellTable).filter((sp) => sp.level === 0 && !known.has(sp.id));
}

/** Level-1 Ritual spells (any class list) the Book of Shadows can take. */
export function tomeRitualOptions(
  char: Pick<Character, 'spells_known'>,
  spellTable: Record<string, Spell>
): Spell[] {
  const known = new Set(char.spells_known ?? []);
  return Object.values(spellTable).filter(
    (sp) => sp.level === 1 && !!sp.ritualCasting && !known.has(sp.id)
  );
}

// ── Lessons of the First Ones ───────────────────────────────────────────────

/** SRD Origin feats (Lessons of the First Ones grants one per learning). */
export const ORIGIN_FEATS = [
  'alert',
  'magic_initiate_arcane',
  'magic_initiate_divine',
  'magic_initiate_primal',
  'savage_attacker',
  'skilled',
];

/** Origin feats the character doesn't have yet (each Lessons pick must differ). */
export function lessonsFeatOptions(char: Pick<Character, 'feats'>): string[] {
  return ORIGIN_FEATS.filter((f) => !(char.feats ?? []).includes(f));
}

/** Lessons of the First Ones learned but whose Origin feat isn't chosen yet. */
export function pendingLessonsFeats(char: Pick<Character, 'feats' | 'lessons_feats'>): number {
  return Math.max(
    0,
    invocationCount(char, 'lessons_of_the_first_ones') - (char.lessons_feats ?? []).length
  );
}

// ── Gift of the Protectors ──────────────────────────────────────────────────

/** How many names the Book of Shadows' page holds: CHA modifier, minimum 1. */
export function protectorsPageMax(char: Pick<Character, 'cha'>): number {
  return Math.max(1, Math.floor((char.cha - 10) / 2));
}

/**
 * SRD Gift of the Protectors — the Warlock whose page names `targetId` and
 * whose once-per-Long-Rest protection is unspent, if any.
 */
export function protectorFor(chars: Character[], targetId: string): Character | undefined {
  return chars.find(
    (w) =>
      !w.dead &&
      hasInvocation(w, 'gift_of_the_protectors') &&
      (w.protectors_page ?? []).includes(targetId) &&
      !(w.class_resource_uses?.gift_of_protectors_used ?? 0)
  );
}

// ── Gaze of Two Minds ───────────────────────────────────────────────────────

/** SRD Gaze of Two Minds — the linked ally's id while the link holds. */
export function gazeAllyId(
  char: Pick<Character, 'conditions' | 'gaze_ally_id'>
): string | undefined {
  return (char.conditions ?? []).includes('gaze_linked') ? char.gaze_ally_id : undefined;
}

/** The free-cast use key for a once-per-Long-Rest invocation spell. */
export function invocationUsedKey(invocationId: string): string {
  return `invocation_used_${invocationId}`;
}
