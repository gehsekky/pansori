import type { FrontendContext } from '../types.js';

export const context: FrontendContext = {
  id: 'vale_of_shadows',

  displayName: 'Vale of Shadows',
  tagline:
    'A market town on the edge of the Vale. The old crypt stirs at night, and the Guild needs adventurers.',
  previewArt: `
   ╔═ VALE ═══════╗
   ║ Millhaven    ║
   ║ ▲ ▲ ▲ ▲ ▲    ║
   ║   Old Road   ║
   ║ ┌─Crypt─┐    ║
   ║ │ ✚ ✚ ✚ │    ║
   ║ └───────┘    ║
   ╚══════════════╝`,

  classes: [
    { id: 'Fighter', desc: 'Martial combatant. Extra attack at L5. Second Wind. Heavy armor.' },
    { id: 'Rogue', desc: 'Sneak Attack. Cunning Action. Finesse weapons. Light armor.' },
    { id: 'Wizard', desc: 'Arcane spellcaster. INT-based. Spellbook. No armor proficiency.' },
    { id: 'Cleric', desc: 'Divine spellcaster. Channel Divinity. Medium armor + shield.' },
    { id: 'Ranger', desc: 'Favored Enemy. Extra Attack at L5. Longbow + medium armor.' },
    { id: 'Paladin', desc: 'Divine Smite on hit. Lay on Hands healing. Heavy armor + shield.' },
    { id: 'Bard', desc: 'Bardic Inspiration. CHA spellcaster. Persuasion expert. Light armor.' },
  ],

  classPrimaryStats: {
    Fighter: 'STR',
    Rogue: 'DEX',
    Wizard: 'INT',
    Cleric: 'WIS',
    Ranger: 'DEX',
    Paladin: 'STR',
    Bard: 'CHA',
  },

  classSkills: {
    Fighter: ['Athletics', 'Intimidation'],
    Rogue: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
    Wizard: ['Arcana', 'Investigation', 'History'],
    Cleric: ['Medicine', 'Religion', 'Insight'],
    Ranger: ['Perception', 'Stealth', 'Nature', 'Survival'],
    Paladin: ['Athletics', 'Persuasion', 'Insight'],
    Bard: ['Persuasion', 'Deception', 'Performance', 'Perception'],
  },

  classFeatures: {
    Fighter: ['extra_attack', 'second_wind'],
    Rogue: ['sneak_attack', 'cunning_action'],
    Wizard: ['spellcasting'],
    Cleric: ['spellcasting', 'channel_divinity'],
    Ranger: ['extra_attack', 'favored_enemy'],
    Paladin: ['divine_smite', 'lay_on_hands'],
    Bard: ['spellcasting', 'bardic_inspiration'],
  },

  // Vale of Shadows backend context doesn't define backgrounds yet; omit on the FE
  backgrounds: [],

  theme: {
    pageBg: '#0a0908',
    cardBg: '#16110d',
    font: 'monospace',
    primary: '#d4b483',
    mid: '#8c7a5f',
    dim: '#5a4d3a',
    dimDark: '#2a221a',
    border: '#3a2f22',
    separator: '#241c14',
    itemColor: '#b8a07a',
    hpHigh: '#7cb342',
    hpMid: '#e6a23c',
    hpLow: '#c93838',
    title: 'VALE OF SHADOWS',
    worldLabel: 'REGION',
  },

  // Item icons / descs intentionally mirror the sandbox vocabulary — the items
  // themselves are shared loot entries in the backend lootTable.
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
    holy_symbol: '✚',
    component_pouch: '🎒',
    moonstone_amulet: '🌙',
    guild_ledger: '📜',
    shadow_evidence: '✉',
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
    holy_symbol: 'Focus for divine spellcasting',
    component_pouch: 'Material components for arcane spells',
    moonstone_amulet: '+1 to WIS saves while attuned',
    guild_ledger: 'A waterlogged ledger bearing the Guild stamp',
    shadow_evidence: "An incriminating letter with the Captain's seal",
  },

  // No per-room art assets shipped yet for Vale. RoomArtPanel will render
  // nothing for these rooms; the room-arrival narrative still appears.
  art: {},
};
