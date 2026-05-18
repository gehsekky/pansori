import type { FrontendContext } from '../types.js';

export const context: FrontendContext = {
  id: 'whispering_pines',

  displayName: 'Whispering Pines',
  tagline:
    'A frozen mountain pass. A trapper gone missing. A cult above the snow line — and fire is your friend.',
  previewArt: `
   ╔═ PINES ══════╗
   ║   ❄ ❄ ❄ ❄    ║
   ║  Whispering  ║
   ║ ─Pass─ ▲ ▲ ▲ ║
   ║ ┌─Spire─┐    ║
   ║ │ ✦ ✦ ✦ │    ║
   ╚══════════════╝`,

  classes: [
    { id: 'Fighter', desc: 'Martial combatant. Extra attack at L5. Second Wind. Heavy armor.' },
    { id: 'Rogue', desc: 'Sneak Attack. Cunning Action. Finesse weapons. Light armor.' },
    {
      id: 'Wizard',
      desc: 'Arcane spellcaster. INT-based. Fire Bolt, Burning Hands, Magic Missile.',
    },
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

  backgrounds: [],

  // Icy blue/grey palette — distinct from Vale's amber/brown.
  theme: {
    pageBg: '#070b10',
    cardBg: '#0e161f',
    font: 'monospace',
    primary: '#9fc7e8',
    mid: '#5f7d96',
    dim: '#3a4e63',
    dimDark: '#1a242f',
    border: '#22323f',
    separator: '#101820',
    itemColor: '#a8c7df',
    hpHigh: '#7cb342',
    hpMid: '#e6a23c',
    hpLow: '#c93838',
    title: 'WHISPERING PINES',
    worldLabel: 'PASS',
  },

  itemIcons: {
    dagger: '🗡',
    handaxe: '🪓',
    quarterstaff: '🥢',
    mace: '🔨',
    warhammer: '🔨',
    shortbow: '🏹',
    shortsword: '⚔',
    rapier: '🤺',
    longsword: '⚔',
    greatsword: '⚔',
    longbow: '🏹',
    leather_armor: '🛡',
    studded_leather: '🛡',
    chain_shirt: '🛡',
    chain_mail: '🛡',
    plate_armor: '🛡',
    shield: '🛡',
    fur_cloak: '🧥',
    healing_potion: '🧪',
    elixir_of_warmth: '🍶',
    holy_symbol: '✚',
    component_pouch: '🎒',
    halden_locket: '📿',
    cult_idol: '🗿',
  },

  itemDescs: {
    dagger: '1d4 piercing, finesse, light, thrown',
    handaxe: '1d6 slashing, light, thrown',
    quarterstaff: '1d6 bludgeoning (1d8 two-handed), versatile',
    mace: '1d6 bludgeoning',
    warhammer: '1d8 bludgeoning (1d10 two-handed), versatile',
    shortbow: '1d6 piercing, ranged (80/320)',
    shortsword: '1d6 piercing, finesse, light',
    rapier: '1d8 piercing, finesse',
    longsword: '1d8 slashing (1d10 two-handed), versatile',
    greatsword: '2d6 slashing, heavy, two-handed',
    longbow: '1d8 piercing, heavy, ranged (150/600)',
    leather_armor: 'AC 11 + DEX mod, light armor',
    studded_leather: 'AC 12 + DEX mod, light armor',
    chain_shirt: 'AC 13 + DEX mod (max +2), medium armor',
    chain_mail: 'AC 16, heavy armor',
    plate_armor: 'AC 18, heavy armor',
    shield: '+2 AC while equipped',
    fur_cloak: 'A thick bearskin cloak — warm enough to ride the pass at night',
    healing_potion: 'Restores 2d4+2 HP when consumed',
    elixir_of_warmth: 'Mulled spirits — restores 1d4+2 HP',
    holy_symbol: 'Focus for divine spellcasting',
    component_pouch: 'Material components for arcane spells',
    halden_locket: "A trapper's silver locket — proof of his fate",
    cult_idol: 'Black ironwood carved with a cult rune',
  },

  art: {},
};
