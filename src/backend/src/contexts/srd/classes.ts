import type { AbilityKey } from '../../types.js';

// Canonical SRD class metadata.
//
// These tables are static D&D rules — hit dice, proficiencies, saving
// throws — and are identical across every campaign. Each context spreads
// the relevant table into its own field; if a campaign deliberately
// diverges from RAW (e.g. a low-magic setting that strips spellcasting
// from a class), it can override individual entries.
//
// Class identifiers use PHB titlecase: 'Fighter', 'Rogue', 'Wizard', etc.

// ─── Hit Dice (PHB 2024 — same as 2014) ──────────────────────────────────────
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

// ─── Armor Proficiencies (PHB 2024 p.50+) ────────────────────────────────────
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

// ─── Weapon Proficiencies (PHB 2024 p.50+) ───────────────────────────────────
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

// ─── Saving Throws (PHB 2024 — same as 2014) ─────────────────────────────────
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

// ─── Weapon Mastery slots (2024 PHB) ─────────────────────────────────────────
// Number of weapons a class can "train" with at L1, gaining access to that
// weapon's Mastery property (e.g. Topple on a maul). Classes not listed here
// don't get the Weapon Mastery feature. Slot counts scale at higher levels
// in 2024 RAW (Fighter +1 at L4/L10/L16, etc.); we apply the L1 baseline and
// extend later when leveling lands. PHB p.45 (Barb), 51 (Fight), 81 (Pal),
// 89 (Rang), 97 (Rog).
export const SRD_WEAPON_MASTERY_SLOTS: Record<string, number> = {
  Barbarian: 2,
  Fighter: 3,
  Paladin: 2,
  Ranger: 2,
  Rogue: 1,
};

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
