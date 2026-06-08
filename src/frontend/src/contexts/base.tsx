import type { FrontendContext } from '../types.js';

// The single FRONTEND donor context. Pansori resolves every campaign as DB
// rows (the backend serves their presentation + creation config via
// /game/contexts); the FE no longer ships a code context per campaign. This
// one donor supplies the static reference data the creation screen needs for
// ANY campaign — the full 12-class roster with primary stats / skills /
// features, the standard backgrounds, the item-description vocabulary — plus a
// neutral default theme. CharScreen synthesizes each campaign's card over this
// donor, overlaying the campaign's own id/name/tagline/preview/classes/theme
// from the backend summary; the in-game theme rides in via the seed.
//
// `hidden` keeps it out of the picker (it is never a playable campaign), but it
// remains the donor every synthesized card builds on. `id: '__base__'` matches
// the backend base template's reserved id.

export const context: FrontendContext = {
  id: '__base__',
  hidden: true,

  displayName: 'Pansori',
  tagline: 'An SRD 5.2.1 tabletop engine.',
  previewArt: `
  +--- PANSORI ---+
  | SRD 5.2.1     |
  +---------------+`,

  // The full SRD class roster — the superset any campaign draws from. A
  // campaign's own (possibly narrower) class list comes from the backend
  // summary and overrides this in the synthesized card.
  classes: [
    { id: 'Fighter', desc: 'Martial combatant. Extra attack at L5. Second Wind. Heavy armor.' },
    { id: 'Rogue', desc: 'Sneak Attack. Cunning Action. Finesse weapons. Light armor.' },
    { id: 'Wizard', desc: 'Arcane spellcaster. INT-based. Fireball, Misty Step. No armor.' },
    { id: 'Cleric', desc: 'Divine spellcaster. Channel Divinity. Medium armor + shield.' },
    { id: 'Ranger', desc: 'Favored Enemy. Extra Attack at L5. Longbow + medium armor.' },
    { id: 'Paladin', desc: 'Divine Smite on hit. Lay on Hands healing. Heavy armor + shield.' },
    { id: 'Bard', desc: 'Bardic Inspiration. CHA spellcaster. Charm Person, Sleep, Healing Word.' },
    { id: 'Druid', desc: 'Wild Shape. WIS spellcaster. Shillelagh, Entangle. Medium armor.' },
    { id: 'Sorcerer', desc: 'Innate magic. Sorcery Points + Metamagic. Fire-bolt focus.' },
    {
      id: 'Warlock',
      desc: 'Pact Magic (short-rest slots). Eldritch Blast + Hex + Hunger of Hadar.',
    },
    { id: 'Monk', desc: 'Ki points, Martial Arts, Unarmored Defense. Shortsword + darts.' },
    { id: 'Barbarian', desc: 'Rage. Greataxe damage. Extra Attack at L5. Unarmored Defense.' },
  ],

  classPrimaryStats: {
    Fighter: 'STR',
    Rogue: 'DEX',
    Wizard: 'INT',
    Cleric: 'WIS',
    Ranger: 'DEX',
    Paladin: 'STR',
    Bard: 'CHA',
    Druid: 'WIS',
    Sorcerer: 'CHA',
    Warlock: 'CHA',
    Monk: 'WIS',
    Barbarian: 'STR',
  },

  classSkills: {
    Fighter: ['Athletics', 'Intimidation'],
    Rogue: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
    Wizard: ['Arcana', 'Investigation', 'History'],
    Cleric: ['Medicine', 'Religion', 'Insight'],
    Ranger: ['Perception', 'Stealth', 'Nature', 'Survival'],
    Paladin: ['Athletics', 'Persuasion', 'Insight'],
    Bard: ['Persuasion', 'Deception', 'Performance', 'Perception'],
    Druid: ['Nature', 'Survival', 'Animal Handling'],
    Sorcerer: ['Arcana', 'Persuasion'],
    Warlock: ['Arcana', 'Deception', 'Intimidation'],
    Monk: ['Athletics', 'Stealth', 'Acrobatics'],
    Barbarian: ['Athletics', 'Intimidation', 'Survival'],
  },

  classFeatures: {
    Fighter: ['extra_attack', 'second_wind'],
    Rogue: ['sneak_attack', 'cunning_action'],
    Wizard: ['spellcasting'],
    Cleric: ['spellcasting', 'channel_divinity'],
    Ranger: ['extra_attack', 'favored_enemy'],
    Paladin: ['divine_smite', 'lay_on_hands'],
    Bard: ['spellcasting', 'bardic_inspiration'],
    Druid: ['wild_shape', 'channel_divinity', 'spellcasting'],
    Sorcerer: ['sorcery_points', 'metamagic', 'spellcasting'],
    Warlock: ['eldritch_blast', 'pact_magic', 'spellcasting'],
    Monk: ['ki', 'unarmored_defense', 'martial_arts'],
    Barbarian: ['rage', 'extra_attack', 'unarmored_defense'],
  },

  backgrounds: [
    {
      id: 'soldier',
      name: 'Soldier',
      desc: 'You have served in an organized military force.',
      skillProficiencies: ['Athletics', 'Intimidation'],
      toolProficiency: null,
      feature: 'Military Rank',
      featureDesc: 'Soldiers and veterans recognize your authority.',
    },
    {
      id: 'criminal',
      name: 'Criminal',
      desc: 'You have a history of breaking the law.',
      skillProficiencies: ['Stealth', 'Deception'],
      toolProficiency: "Thieves' Tools",
      feature: 'Criminal Contact',
      featureDesc: 'You have a contact for information and fencing goods.',
    },
    {
      id: 'sage',
      name: 'Sage',
      desc: 'You spent years learning the lore of the multiverse.',
      skillProficiencies: ['Arcana', 'History'],
      toolProficiency: null,
      feature: 'Researcher',
      featureDesc: 'If you do not know information, you know where to find it.',
    },
    {
      id: 'acolyte',
      name: 'Acolyte',
      desc: 'You have spent your life in service to a temple.',
      skillProficiencies: ['Religion', 'Insight'],
      toolProficiency: null,
      feature: 'Shelter of the Faithful',
      featureDesc: 'Temples provide healing and care to you and your companions.',
    },
  ],

  // Neutral default theme — the app's look before a campaign loads, and the
  // base every synthesized card's theme overlays. A campaign's own theme (the
  // DB 'theme' section) comes through the backend summary and the seed.
  theme: {
    pageBg: '#0b0c0e',
    cardBg: '#14161a',
    font: 'monospace',
    primary: '#9fb3c8',
    mid: '#8a93a0',
    dim: '#6b7280',
    dimDark: '#1f2329',
    border: '#2a2f37',
    separator: '#1c2026',
    itemColor: '#aab4c0',
    hpHigh: '#4caf50',
    hpMid: '#ff9800',
    hpLow: '#f44336',
    title: 'PANSORI',
  },

  // The shared item-description vocabulary (superset across campaigns). Items
  // themselves are backend loot entries; this only drives display text.
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
    warhammer: '1d8 bludgeoning (1d10 two-handed), versatile',
    fur_cloak: 'A thick bearskin cloak — warm enough to ride the pass at night',
    elixir_of_warmth: 'Mulled spirits — restores 1d4+2 HP',
    halden_locket: "A trapper's silver locket — proof of his fate",
    cult_idol: 'Black ironwood carved with a cult rune',
    greataxe: '1d12 slashing, heavy, two-handed',
    dart: '1d4 piercing, finesse, thrown (20/60)',
    scale_mail: 'AC 14 + DEX mod (max +2), medium armor',
    circle_charm: "Mareth's carved acorn charm — the grove knows it as kin.",
    oak_heart: "A fist-sized seedpod glowing with green light — the grove's heart restored.",
  },

  art: {},
};
