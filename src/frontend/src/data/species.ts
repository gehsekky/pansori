// Frontend mirror of the backend `SRD_SPECIES` catalog. Kept hand-written
// alongside the backend file because frontend↔backend type drift is on the
// TODO list (no codegen yet). Only the fields the picker UI needs are
// surfaced; the backend is the source of truth for engine wiring.

export interface FrontendSpecies {
  id: string;
  name: string;
  desc: string;
  size: 'small' | 'medium';
  speedFt: number;
  darkvisionFt?: number;
  resistances?: string[];
  innateCantrips?: string[];
  traits: string[];
}

export const SPECIES: FrontendSpecies[] = [
  {
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
  {
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
  {
    id: 'drow',
    name: 'Drow (Elf lineage)',
    desc: 'Subterranean elves with superior darkvision and innate Underdark magic.',
    size: 'medium',
    speedFt: 30,
    darkvisionFt: 120,
    innateCantrips: ['dancing_lights'],
    traits: [
      'Drow Magic: cast Faerie Fire 1/day at L3, Darkness 1/day at L5.',
      'Sunlight Sensitivity: disadvantage on attacks + Perception in direct sunlight.',
    ],
  },
  {
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
  {
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
  {
    id: 'gnome',
    name: 'Gnome',
    desc: 'Inventive, curious, and resistant to magical meddling.',
    size: 'small',
    speedFt: 30,
    darkvisionFt: 60,
    traits: [
      'Gnomish Cunning: advantage on INT, WIS, CHA saves vs magic.',
      'Sharp memory: free Wizard cantrip at L1.',
    ],
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    desc: 'Dragon-blooded humanoids with a draconic ancestor and breath weapon.',
    size: 'medium',
    speedFt: 30,
    resistances: ['fire'],
    traits: [
      'Breath Weapon: 1d10 damage in a 15-ft cone, DEX save.',
      'Damage Resistance to ancestry type (default: fire).',
      'Draconic Flight: spectral wings at L5 (1 min, 1/long rest).',
    ],
  },
  {
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
  {
    id: 'goliath',
    name: 'Goliath',
    desc: 'Mountain-bred giants with otherworldly stamina (new in 2024 PHB).',
    size: 'medium',
    speedFt: 35,
    traits: [
      'Giant Ancestry: pick a giant lineage trait.',
      'Large Form: 1/day, become Large for 10 min — advantage on STR checks, +10 ft speed.',
      'Powerful Build: count as one size larger for carrying capacity.',
    ],
  },
  {
    id: 'orc',
    name: 'Orc',
    desc: 'Bold, durable warriors with primal fury (2024 PHB).',
    size: 'medium',
    speedFt: 30,
    darkvisionFt: 120,
    traits: [
      'Adrenaline Rush: take Dash as a bonus action (1/short rest); temp HP = prof bonus.',
      'Relentless Endurance: when dropped to 0 HP without dying, drop to 1 HP instead (1/long rest).',
    ],
  },
];
