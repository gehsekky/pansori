import type { FrontendContext } from '../types.js';

export const context: FrontendContext = {
  id: 'sandbox',
  // Internal-testing campaign — hidden from the player picker (Malgovia is the
  // sole player-facing campaign). Launch it via `/?campaign=sandbox`.
  hidden: true,

  displayName: 'Sandbox',
  tagline: 'A development dungeon for testing mechanics. Every rule exercised.',
  recommendedPartySize: 1,
  previewArt: `
  +---SANDBOX---+
  | [ Fighter ] |
  | [ Rogue   ] |
  | [ Wizard  ] |
  | [ Cleric  ] |
  | [ Ranger  ] |
  +---5e rules--+`,

  classes: [
    { id: 'Fighter', desc: 'Martial combatant. Extra attack at level 5. Heavy armor proficiency.' },
    { id: 'Rogue', desc: 'Sneak attack. Finesse weapons. Light armor only.' },
    { id: 'Wizard', desc: 'Fire Bolt cantrip. Magic Missile spell. No armor proficiency.' },
    { id: 'Cleric', desc: 'Sacred Flame cantrip. Cure Wounds spell. Medium armor + shield.' },
    { id: 'Ranger', desc: 'Longbow specialist. Extra attack at level 5. Medium armor.' },
  ],

  classPrimaryStats: {
    Fighter: 'STR',
    Rogue: 'DEX',
    Wizard: 'INT',
    Cleric: 'WIS',
    Ranger: 'DEX',
  },

  classSkills: {
    Fighter: ['Athletics', 'Intimidation'],
    Rogue: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
    Wizard: ['Arcana', 'Investigation', 'History'],
    Cleric: ['Medicine', 'Religion', 'Insight'],
    Ranger: ['Perception', 'Stealth', 'Nature', 'Survival'],
  },

  classFeatures: {
    Fighter: ['extra_attack'],
    Rogue: ['sneak_attack'],
    Wizard: [],
    Cleric: [],
    Ranger: ['extra_attack'],
  },

  backgrounds: [
    {
      id: 'soldier',
      name: 'Soldier',
      desc: 'You have served in an organized military force.',
      skillProficiencies: ['athletics', 'intimidation'],
      toolProficiency: null,
      feature: 'Military Rank',
      featureDesc: 'Soldiers and veterans recognize your authority.',
    },
    {
      id: 'criminal',
      name: 'Criminal',
      desc: 'You have a history of breaking the law.',
      skillProficiencies: ['stealth', 'deception'],
      toolProficiency: "Thieves' Tools",
      feature: 'Criminal Contact',
      featureDesc: 'You have a contact for information and fencing goods.',
    },
    {
      id: 'sage',
      name: 'Sage',
      desc: 'You spent years learning the lore of the multiverse.',
      skillProficiencies: ['arcana', 'history'],
      toolProficiency: null,
      feature: 'Researcher',
      featureDesc: 'If you do not know information, you know where to find it.',
    },
    {
      id: 'acolyte',
      name: 'Acolyte',
      desc: 'You have spent your life in service to a temple.',
      skillProficiencies: ['religion', 'insight'],
      toolProficiency: null,
      feature: 'Shelter of the Faithful',
      featureDesc: 'Temples provide healing and care to you and your companions.',
    },
  ],

  theme: {
    pageBg: '#0a0a0a',
    cardBg: '#111',
    font: 'monospace',
    primary: '#c8a96e',
    mid: '#9a9a9a',
    dim: '#7e7e7e',
    dimDark: '#222',
    border: '#333',
    separator: '#222',
    itemColor: '#aaa',
    hpHigh: '#4caf50',
    hpMid: '#ff9800',
    hpLow: '#f44336',
    title: 'SANDBOX',
    worldLabel: 'DUNGEON',
  },

  itemIcons: {
    dagger: '🗡',
    handaxe: '🪓',
    quarterstaff: '🥢',
    mace: '🔨',
    shortbow: '🏹',
    shortsword: '⚔',
    rapier: '🤺',
    longsword: '⚔',
    greatsword: '⚔',
    longbow: '🏹',
    plus1_longsword: '✨',
    leather_armor: '🛡',
    studded_leather: '🛡',
    chain_shirt: '🛡',
    chain_mail: '🛡',
    plate_armor: '🛡',
    shield: '🛡',
    healing_potion: '🧪',
  },

  itemDescs: {
    dagger: '1d4 piercing, finesse, light, thrown',
    handaxe: '1d6 slashing, light, thrown',
    quarterstaff: '1d6 bludgeoning (1d8 two-handed), versatile',
    mace: '1d6 bludgeoning',
    shortbow: '1d6 piercing, ranged (80/320)',
    shortsword: '1d6 piercing, finesse, light',
    rapier: '1d8 piercing, finesse',
    longsword: '1d8 slashing (1d10 two-handed), versatile',
    greatsword: '2d6 slashing, heavy, two-handed',
    longbow: '1d8 piercing, heavy, ranged (150/600)',
    plus1_longsword: '1d8+1 slashing (1d10+1 two-handed), magical',
    leather_armor: 'AC 11 + DEX mod, light armor',
    studded_leather: 'AC 12 + DEX mod, light armor',
    chain_shirt: 'AC 13 + DEX mod (max +2), medium armor',
    chain_mail: 'AC 16, heavy armor',
    plate_armor: 'AC 18, heavy armor',
    shield: '+2 AC while equipped',
    healing_potion: 'Restores 2d4+2 HP when consumed',
  },

  art: {},
};
