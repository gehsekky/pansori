import type { AbilityKey } from '../../types.js';

// Canonical SRD class metadata.
//
// These tables are static D&D rules — hit dice, proficiencies, saving
// throws — and are identical across every campaign. Each context spreads
// the relevant table into its own field; if a campaign deliberately
// diverges from RAW (e.g. a low-magic setting that strips spellcasting
// from a class), it can override individual entries.
//
// Class identifiers use SRD titlecase: 'Fighter', 'Rogue', 'Wizard', etc.

// ─── Hit Dice (SRD — same as 2014) ──────────────────────────────────────
export const SRD_CLASS_HIT_DIE: Record<string, number> = {
  Fighter: 10,
  Rogue: 8,
  Wizard: 6,
  Cleric: 8,
  Ranger: 10,
  Paladin: 10,
  Bard: 8,
  Druid: 8,
  Sorcerer: 6,
  Warlock: 8,
  Monk: 8,
  Barbarian: 12,
};

// ─── Armor Proficiencies (SRD) ────────────────────────────────────
export const SRD_CLASS_ARMOR_PROFICIENCIES: Record<string, string[]> = {
  Fighter: ['light', 'medium', 'heavy', 'shield'],
  Rogue: ['light'],
  Wizard: [],
  Cleric: ['light', 'medium', 'shield'],
  Ranger: ['light', 'medium', 'shield'],
  Paladin: ['light', 'medium', 'heavy', 'shield'],
  Bard: ['light'],
  Druid: ['light', 'medium', 'shield'],
  Sorcerer: [],
  Warlock: ['light'],
  Monk: [],
  Barbarian: ['light', 'medium', 'shield'],
};

// ─── Weapon Proficiencies (SRD) ───────────────────────────────────
export const SRD_CLASS_WEAPON_PROFICIENCIES: Record<string, string[]> = {
  Fighter: ['simple', 'martial'],
  Rogue: ['simple', 'martial'],
  Wizard: ['simple'],
  Cleric: ['simple'],
  Ranger: ['simple', 'martial'],
  Paladin: ['simple', 'martial'],
  Bard: ['simple', 'martial'],
  Druid: ['simple'],
  Sorcerer: ['simple'],
  Warlock: ['simple'],
  Monk: ['simple', 'shortsword'],
  Barbarian: ['simple', 'martial'],
};

// ─── Saving Throws (SRD — same as 2014) ─────────────────────────────────
export const SRD_CLASS_SAVING_THROWS: Record<string, AbilityKey[]> = {
  Fighter: ['str', 'con'],
  Rogue: ['dex', 'int'],
  Wizard: ['int', 'wis'],
  Cleric: ['wis', 'cha'],
  Ranger: ['str', 'dex'],
  Paladin: ['wis', 'cha'],
  Bard: ['dex', 'cha'],
  Druid: ['str', 'wis'],
  Sorcerer: ['con', 'cha'],
  Warlock: ['wis', 'cha'],
  Monk: ['str', 'dex'],
  Barbarian: ['str', 'con'],
};

// ─── Primary Spellcasting Ability ────────────────────────────────────────────
// Where SRD class features key off a single stat (spell DC, attack bonus,
// melee mod for some classes). Paladin uses STR for melee + CHA for spells —
// we model the spell side via spellcastingAbility (below) and surface STR
// as the primary stat for the campaign UI.
export const SRD_CLASS_PRIMARY_STATS: Record<string, AbilityKey> = {
  Fighter: 'str',
  Rogue: 'dex',
  Wizard: 'int',
  Cleric: 'wis',
  Ranger: 'dex',
  Paladin: 'str',
  Bard: 'cha',
  Druid: 'wis',
  Sorcerer: 'cha',
  Warlock: 'cha',
  Monk: 'wis',
  Barbarian: 'str',
};

// ─── Spellcasting Ability ────────────────────────────────────────────────────
// Used by the spell DC + spell attack bonus calculations. Only listed for
// classes that cast spells.
export const SRD_SPELLCASTING_ABILITY: Record<string, AbilityKey> = {
  Wizard: 'int',
  Cleric: 'wis',
  Bard: 'cha',
  Paladin: 'cha',
  Druid: 'wis',
  Sorcerer: 'cha',
  Warlock: 'cha',
  Ranger: 'wis',
};

// ─── Weapon Mastery slots (SRD) ─────────────────────────────────────────
// Number of weapons a class can "train" with at L1, gaining access to that
// weapon's Mastery property (e.g. Topple on a maul). Classes not listed here
// don't get the Weapon Mastery feature. Slot counts scale at higher levels
// in 2024 RAW (Fighter +1 at L4/L10/L16, etc.); we apply the L1 baseline and
// extend later when leveling lands. SRD class sections: Barbarian / Fighter /
// Paladin / Ranger / Rogue.
export const SRD_WEAPON_MASTERY_SLOTS: Record<string, number> = {
  Barbarian: 2,
  Fighter: 3,
  Paladin: 2,
  Ranger: 2,
  Rogue: 2, // SRD Rogue Weapon Mastery: "two kinds of weapons".
};

/**
 * Number of weapons a class masters at a given class level (2024 SRD). Fighter
 * (4/10/16) and Barbarian (4/10) gain more slots as they level; Paladin /
 * Ranger / Rogue stay at their level-1 count. 0 for classes without the feature.
 */
export function weaponMasterySlotsForLevel(className: string, classLevel: number): number {
  const base = SRD_WEAPON_MASTERY_SLOTS[className] ?? 0;
  if (base <= 0) return 0;
  if (className === 'Fighter') {
    return classLevel >= 16 ? 6 : classLevel >= 10 ? 5 : classLevel >= 4 ? 4 : 3;
  }
  if (className === 'Barbarian') {
    return classLevel >= 10 ? 4 : classLevel >= 4 ? 3 : 2;
  }
  return base; // Paladin / Ranger / Rogue — fixed at their level-1 count.
}

// ─── Class Features ──────────────────────────────────────────────────────────
// Feature ids that the gameEngine recognizes. These drive the choice
// generation + handler dispatch in gameEngine.ts. A class missing 'rage'
// won't see Rage choices; adding 'extra_attack' grants the L5 second-attack
// path. Campaign overrides can prune (e.g. a no-magic setting strips
// 'spellcasting') but typically just spread this as-is.
export const SRD_CLASS_FEATURES: Record<string, string[]> = {
  Fighter: ['extra_attack', 'second_wind'],
  Rogue: ['sneak_attack', 'cunning_action'],
  Wizard: ['spellcasting', 'arcane_recovery'],
  Cleric: ['spellcasting', 'channel_divinity'],
  Ranger: ['extra_attack', 'favored_enemy'],
  Paladin: ['divine_smite', 'lay_on_hands'],
  Bard: ['spellcasting', 'bardic_inspiration'],
  Druid: ['wild_shape', 'channel_divinity', 'spellcasting'],
  Sorcerer: ['sorcery_points', 'metamagic', 'spellcasting'],
  Warlock: ['eldritch_blast', 'pact_magic', 'spellcasting'],
  Monk: ['ki', 'unarmored_defense', 'martial_arts'],
  Barbarian: ['rage', 'extra_attack', 'unarmored_defense'],
};

// ─── Class Skills (default skill list per class) ─────────────────────────────
// Used by the character creation flow to pick skill proficiencies from the
// class's available list. Specific PCs end up with 2-4 skills selected
// from this list (or campaign overrides).
export const SRD_CLASS_SKILLS: Record<string, string[]> = {
  Fighter: ['athletics', 'intimidation'],
  Rogue: ['stealth', 'sleight_of_hand', 'deception', 'perception'],
  Wizard: ['arcana', 'investigation', 'history'],
  Cleric: ['medicine', 'religion', 'insight'],
  Ranger: ['perception', 'stealth', 'nature', 'survival'],
  Paladin: ['athletics', 'persuasion', 'insight'],
  Bard: ['persuasion', 'deception', 'performance', 'perception'],
  Druid: ['nature', 'survival', 'animal_handling'],
  Sorcerer: ['arcana', 'persuasion'],
  Warlock: ['arcana', 'deception', 'intimidation'],
  Monk: ['athletics', 'stealth', 'acrobatics'],
  Barbarian: ['athletics', 'intimidation', 'survival'],
};

// The 18 SRD skills (snake_case ids) — Bard chooses any 3 of these.
export const ALL_SKILLS: readonly string[] = [
  'acrobatics',
  'animal_handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight_of_hand',
  'stealth',
  'survival',
];

// 2024 SRD class skill proficiencies — "choose `count` from `options`". The
// curated picks in SRD_CLASS_SKILLS double as the default selection; the
// creation flow lets the player pick any valid subset of `options`.
export const SRD_CLASS_SKILL_CHOICES: Record<string, { count: number; options: string[] }> = {
  Barbarian: {
    count: 2,
    options: ['animal_handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
  },
  Bard: { count: 3, options: [...ALL_SKILLS] },
  Cleric: { count: 2, options: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
  Druid: {
    count: 2,
    options: [
      'animal_handling',
      'arcana',
      'insight',
      'medicine',
      'nature',
      'perception',
      'religion',
      'survival',
    ],
  },
  Fighter: {
    count: 2,
    options: [
      'acrobatics',
      'animal_handling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'persuasion',
      'perception',
      'survival',
    ],
  },
  Monk: {
    count: 2,
    options: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
  },
  Paladin: {
    count: 2,
    options: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
  },
  Ranger: {
    count: 3,
    options: [
      'animal_handling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ],
  },
  Rogue: {
    count: 4,
    options: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'persuasion',
      'sleight_of_hand',
      'stealth',
    ],
  },
  Sorcerer: {
    count: 2,
    options: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
  },
  Warlock: {
    count: 2,
    options: [
      'arcana',
      'deception',
      'history',
      'intimidation',
      'investigation',
      'nature',
      'religion',
    ],
  },
  Wizard: {
    count: 2,
    options: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'],
  },
};

/**
 * The default "choose N" selection for a class — exactly `count` skills,
 * preferring the curated recommendations (`SRD_CLASS_SKILLS[class]`, which is
 * generous and may list more than `count`) and topping up from the class
 * options when the curated list runs short. Falls back to the raw curated
 * list for classes with no choice table. Used both as the creation-screen
 * pre-selection and as the server-side fallback.
 */
export function defaultClassSkills(className: string, curated: readonly string[]): string[] {
  const choice = SRD_CLASS_SKILL_CHOICES[className];
  if (!choice) return [...curated];
  const out: string[] = [];
  const add = (s: string) => {
    if (out.length < choice.count && choice.options.includes(s) && !out.includes(s)) out.push(s);
  };
  curated.map((s) => s.toLowerCase()).forEach(add); // curated picks first
  choice.options.forEach(add); // then top up from the offered options
  return out;
}

/**
 * Resolve a character's class skill proficiencies. If `chosen` is a valid
 * selection for the class — every entry an offered option, no duplicates, and
 * exactly `count` of them — it's used (lowercased); otherwise we fall back to
 * the count-trimmed default for the class.
 */
export function resolveClassSkills(
  className: string,
  chosen: readonly string[] | undefined,
  fallback: readonly string[]
): string[] {
  const choice = SRD_CLASS_SKILL_CHOICES[className];
  if (!choice) return [...fallback];
  if (chosen) {
    const lowered = chosen.map((s) => s.toLowerCase());
    const distinct = new Set(lowered);
    const valid =
      lowered.length === choice.count &&
      distinct.size === choice.count &&
      lowered.every((s) => choice.options.includes(s));
    if (valid) return [...distinct];
  }
  return defaultClassSkills(className, fallback);
}

// ─── Starting equipment (2024 SRD "Choose A, B, or C") ───────────────────────
// Each class offers a few starting-equipment packages: a gear loadout (+ a
// little gold) or a gold-only option to buy your own. pansori's combat-focused
// catalog doesn't model packs / focuses / ammo / tools, so those are dropped
// (the gold compensates) and a few weapons are mapped to the nearest item we
// carry: greatsword→greataxe, flail→mace, javelin→handaxe, scimitar→shortsword,
// spear→quarterstaff, sickle→dagger. GP amounts are taken from the SRD.
export interface EquipmentPackage {
  id: string; // 'A' | 'B' | 'C'
  label: string; // short human descriptor for the picker
  items: string[]; // SRD_ITEMS ids (duplicates → multiple instances)
  gold: number; // starting GP for this package
}

export const SRD_CLASS_STARTING_EQUIPMENT: Record<string, EquipmentPackage[]> = {
  Barbarian: [
    { id: 'A', label: 'Greataxe & handaxes', items: ['greataxe', 'handaxe', 'handaxe'], gold: 15 },
    { id: 'B', label: 'Gold only', items: [], gold: 75 },
  ],
  Bard: [
    { id: 'A', label: 'Leather & daggers', items: ['leather_armor', 'dagger', 'dagger'], gold: 19 },
    { id: 'B', label: 'Gold only', items: [], gold: 90 },
  ],
  Cleric: [
    {
      id: 'A',
      label: 'Chain shirt, shield & mace',
      items: ['chain_shirt', 'shield', 'mace'],
      gold: 7,
    },
    { id: 'B', label: 'Gold only', items: [], gold: 110 },
  ],
  Druid: [
    {
      id: 'A',
      label: 'Leather, shield & staff',
      items: ['leather_armor', 'shield', 'quarterstaff', 'dagger'],
      gold: 9,
    },
    { id: 'B', label: 'Gold only', items: [], gold: 50 },
  ],
  Fighter: [
    {
      id: 'A',
      label: 'Heavy melee',
      items: ['chain_mail', 'greataxe', 'mace', 'handaxe'],
      gold: 4,
    },
    {
      id: 'B',
      label: 'Skirmisher',
      items: ['studded_leather', 'shortsword', 'shortsword', 'longbow'],
      gold: 11,
    },
    { id: 'C', label: 'Gold only', items: [], gold: 155 },
  ],
  Monk: [
    { id: 'A', label: 'Staff & daggers', items: ['quarterstaff', 'dagger', 'dagger'], gold: 11 },
    { id: 'B', label: 'Gold only', items: [], gold: 50 },
  ],
  Paladin: [
    {
      id: 'A',
      label: 'Chain mail, shield & sword',
      items: ['chain_mail', 'shield', 'longsword', 'handaxe'],
      gold: 9,
    },
    { id: 'B', label: 'Gold only', items: [], gold: 150 },
  ],
  Ranger: [
    {
      id: 'A',
      label: 'Studded leather & bow',
      items: ['studded_leather', 'shortsword', 'shortsword', 'longbow'],
      gold: 7,
    },
    { id: 'B', label: 'Gold only', items: [], gold: 150 },
  ],
  Rogue: [
    {
      id: 'A',
      label: 'Leather, blades & bow',
      items: ['leather_armor', 'dagger', 'dagger', 'shortsword', 'shortbow'],
      gold: 8,
    },
    { id: 'B', label: 'Gold only', items: [], gold: 100 },
  ],
  Sorcerer: [
    { id: 'A', label: 'Staff & daggers', items: ['quarterstaff', 'dagger', 'dagger'], gold: 28 },
    { id: 'B', label: 'Gold only', items: [], gold: 50 },
  ],
  Warlock: [
    { id: 'A', label: 'Leather & daggers', items: ['leather_armor', 'dagger', 'dagger'], gold: 15 },
    { id: 'B', label: 'Gold only', items: [], gold: 100 },
  ],
  Wizard: [
    { id: 'A', label: 'Staff & daggers', items: ['quarterstaff', 'dagger', 'dagger'], gold: 5 },
    { id: 'B', label: 'Gold only', items: [], gold: 55 },
  ],
};

/**
 * Resolve a character's starting equipment. With class packages defined, use
 * the one matching `choiceId` (else the first/default package). Without
 * packages (e.g. a campaign that only sets `classStartingLoot`), fall back to
 * the legacy item list + the default 5 GP.
 */
export function resolveStartingEquipment(
  packages: EquipmentPackage[] | undefined,
  choiceId: string | undefined,
  fallbackIds: readonly string[]
): { items: string[]; gold: number } {
  if (packages && packages.length > 0) {
    const pkg = (choiceId && packages.find((p) => p.id === choiceId)) || packages[0];
    return { items: [...pkg.items], gold: pkg.gold };
  }
  return { items: [...fallbackIds], gold: 5 };
}

// ─── Weapon Mastery selection (2024 SRD) ─────────────────────────────────────
// A class with the Weapon Mastery feature masters `SRD_WEAPON_MASTERY_SLOTS`
// weapons it's proficient with that have a Mastery property. The curated picks
// below are the default selection; the creation flow lets the player choose
// any valid subset.
export const SRD_DEFAULT_WEAPON_MASTERIES: Record<string, string[]> = {
  Fighter: ['longsword', 'shortbow', 'greataxe'],
  Paladin: ['longsword', 'warhammer'],
  Ranger: ['longbow', 'shortsword'],
  Barbarian: ['greataxe', 'handaxe'],
  Rogue: ['shortsword'],
};

// Minimal weapon shape the mastery helpers need (a subset of LootItem).
interface MasterableWeapon {
  id: string;
  name: string;
  mastery?: string;
  weaponType?: string;
}

/**
 * The weapons a class may master: those carrying a Mastery property that the
 * class is proficient with — either by weapon category (`weaponType` in the
 * class's `simple`/`martial` list) or by a specifically-named weapon
 * proficiency (e.g. Monk's shortsword).
 */
export function masterableWeapons(
  weaponProficiencies: readonly string[],
  weapons: readonly MasterableWeapon[]
): Array<{ id: string; name: string; mastery: string }> {
  const profs = new Set(weaponProficiencies.map((p) => p.toLowerCase()));
  return weapons
    .filter(
      (w) =>
        !!w.mastery &&
        (profs.has((w.weaponType ?? '').toLowerCase()) || profs.has(w.id.toLowerCase()))
    )
    .map((w) => ({ id: w.id, name: w.name, mastery: w.mastery as string }));
}

/**
 * The default mastery selection — exactly `count` weapons, preferring the
 * curated picks (filtered to the available options) and topping up from the
 * options. Mirrors `defaultClassSkills`.
 */
export function defaultWeaponMasteries(
  curated: readonly string[],
  optionIds: readonly string[],
  count: number
): string[] {
  if (count <= 0) return [];
  const opts = optionIds.map((s) => s.toLowerCase());
  const out: string[] = [];
  const add = (w: string) => {
    if (out.length < count && opts.includes(w) && !out.includes(w)) out.push(w);
  };
  curated.map((s) => s.toLowerCase()).forEach(add);
  opts.forEach(add);
  return out;
}

/**
 * Resolve a character's mastered weapons. A valid player choice (every entry
 * an offered option, no duplicates, exactly `count`) is used; otherwise we
 * fall back to the count-trimmed default.
 */
export function resolveWeaponMasteries(
  chosen: readonly string[] | undefined,
  optionIds: readonly string[],
  count: number,
  curated: readonly string[]
): string[] {
  if (count <= 0) return [];
  if (chosen) {
    const lowered = chosen.map((s) => s.toLowerCase());
    const distinct = new Set(lowered);
    const opts = new Set(optionIds.map((s) => s.toLowerCase()));
    const valid =
      lowered.length === count && distinct.size === count && lowered.every((w) => opts.has(w));
    if (valid) return [...distinct];
  }
  return defaultWeaponMasteries(curated, optionIds, count);
}

// The single SRD-iconic subclass each class gains at level 3 (SRD 5.2.1
// publishes exactly one subclass per class). Keyed by lowercased class name.
// The engine auto-assigns this at level 3 — there's no choice to make.
export const SRD_SUBCLASS_FOR_CLASS: Record<string, string> = {
  fighter: 'champion',
  rogue: 'thief',
  wizard: 'evoker',
  cleric: 'life',
  ranger: 'hunter',
  paladin: 'devotion',
  bard: 'lore',
  sorcerer: 'draconic',
  warlock: 'fiend',
  druid: 'land',
  monk: 'open_hand',
  barbarian: 'berserker',
};
