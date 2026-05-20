// 2024 PHB Species (formerly "races").
//
// 2024 PHB shifted ability score increases out of species and onto
// backgrounds, so species here only define mechanical traits — speed,
// size, darkvision, damage resistances, innate cantrips, etc. Players
// pick a species at character creation; the engine reads this catalog
// to seed the character's traits.
//
// Subspecies / Lineages (High Elf vs Drow vs Wood Elf, Tiefling Infernal
// vs Abyssal vs Chthonic, etc.) are flattened into the top-level list
// for now — same UX as picking a class subclass at L1. Future work: a
// proper nested picker if the list grows.
//
// Traits we don't yet model (languages, Trance for elves, Dwarven
// Toughness L-scaling HP, Gnomish Cunning advantage on INT/WIS/CHA
// saves vs magic, etc.) are captured in the freeform `traits` array so
// the character sheet can display them even when the engine has no
// machinery to enforce them. Wiring them up is a per-species follow-up.

export interface Species {
  id: string;
  name: string;
  desc: string;
  size: 'small' | 'medium';
  speedFt: number;
  darkvisionFt?: number;
  // Damage types the species has resistance to (half damage). Pansori's
  // applyDamageMultiplier already honours `resistances` on enemies; we
  // mirror the same string set on characters.
  resistances?: string[];
  // Spell ids the species knows for free (no slot cost). e.g. High Elf
  // gets one wizard cantrip; Tieflings get Thaumaturgy.
  innateCantrips?: string[];
  // Free-text traits we don't yet enforce but want to surface on the
  // character sheet. Audit pass material.
  traits: string[];
}

export const SRD_SPECIES: Record<string, Species> = {
  human: {
    id: 'human',
    name: 'Human',
    desc: 'Versatile and ambitious. Gain one Origin Feat from your background and an extra skill proficiency.',
    size: 'medium',
    speedFt: 30,
    traits: [
      'Resourceful: gain Heroic Inspiration after every Long Rest.',
      'Skillful: one extra skill proficiency at L1.',
      'Versatile: gain an Origin Feat from your background.',
    ],
  },
  elf: {
    id: 'elf',
    name: 'Elf',
    desc: 'Graceful and long-lived, with keen senses and innate fey magic.',
    size: 'medium',
    speedFt: 30,
    darkvisionFt: 60,
    traits: [
      'Keen Senses: proficient in Perception.',
      'Trance: 4-hour meditation counts as a Long Rest.',
      "Fey Ancestry: advantage on saves vs Charmed; magic can't put you to sleep.",
    ],
  },
  drow: {
    id: 'drow',
    name: 'Drow (Elf lineage)',
    desc: 'Subterranean elves with superior darkvision and innate Underdark magic.',
    size: 'medium',
    speedFt: 30,
    darkvisionFt: 120,
    innateCantrips: ['dancing_lights'],
    traits: [
      'Drow Magic: cast Faerie Fire 1/day at L3, Darkness 1/day at L5.',
      'Sunlight Sensitivity: disadvantage on attack rolls + WIS (Perception) checks in direct sunlight.',
    ],
  },
  dwarf: {
    id: 'dwarf',
    name: 'Dwarf',
    desc: 'Stout, sturdy folk with deep roots in stone and metal.',
    size: 'medium',
    speedFt: 30,
    darkvisionFt: 120,
    resistances: ['poison'],
    traits: [
      'Dwarven Toughness: +1 max HP at L1, +1 per level.',
      'Stonecunning: tremorsense 60 ft (stone surfaces only).',
      'Advantage on saving throws vs Poisoned.',
    ],
  },
  halfling: {
    id: 'halfling',
    name: 'Halfling',
    desc: 'Small, nimble, and famously lucky.',
    size: 'small',
    speedFt: 30,
    traits: [
      'Lucky: re-roll a Nat 1 on a d20 test (must take the new roll).',
      'Brave: advantage on saves vs Frightened.',
      'Halfling Nimbleness: move through larger creatures.',
    ],
  },
  gnome: {
    id: 'gnome',
    name: 'Gnome',
    desc: 'Inventive, curious, and resistant to magical meddling.',
    size: 'small',
    speedFt: 30,
    darkvisionFt: 60,
    traits: [
      'Gnomish Cunning: advantage on INT, WIS, CHA saves vs magic.',
      'Sharp memory: free Wizard cantrip at L1 (Forest/Rock subspecies).',
    ],
  },
  dragonborn: {
    id: 'dragonborn',
    name: 'Dragonborn',
    desc: 'Dragon-blooded humanoids with a draconic ancestor and breath weapon.',
    size: 'medium',
    speedFt: 30,
    resistances: ['fire'], // default Red ancestry — players pick at table time
    traits: [
      'Breath Weapon: 1d10 damage in a 15-ft cone, DEX save. Damage type matches ancestry.',
      'Damage Resistance to ancestry damage type (default: fire — Red dragon ancestry).',
      'Draconic Flight: spectral wings at L5 (1 minute, 1 long rest).',
    ],
  },
  tiefling: {
    id: 'tiefling',
    name: 'Tiefling',
    desc: 'Fiend-touched humanoids with infernal heritage and innate magic.',
    size: 'medium',
    speedFt: 30,
    darkvisionFt: 60,
    resistances: ['fire'],
    innateCantrips: ['thaumaturgy'],
    traits: [
      'Infernal Legacy: Hellish Rebuke 1/day at L3, Darkness 1/day at L5.',
      'Otherworldly Presence: cast Thaumaturgy at will.',
    ],
  },
  goliath: {
    id: 'goliath',
    name: 'Goliath',
    desc: 'Mountain-bred giants with otherworldly stamina (new in 2024 PHB).',
    size: 'medium',
    speedFt: 35, // 2024: 35 ft base
    traits: [
      'Giant Ancestry: pick a giant lineage trait (Cloud / Fire / Frost / Hill / Stone / Storm).',
      'Large Form: 1/day, become Large for 10 min — advantage on STR checks, +10 ft speed.',
      'Powerful Build: count as one size larger for carrying capacity.',
    ],
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    desc: 'Bold, durable warriors with primal fury (2024 PHB; no longer Half-Orc).',
    size: 'medium',
    speedFt: 30,
    darkvisionFt: 120,
    traits: [
      'Adrenaline Rush: take the Dash action as a bonus action (1/short rest), gain temp HP equal to prof bonus.',
      'Relentless Endurance: when dropped to 0 HP without dying, drop to 1 HP instead (1/long rest).',
    ],
  },
};
